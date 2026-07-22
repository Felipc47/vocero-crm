import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { publish } from "@/server/events/bus";

/**
 * Ficha del lead extraída por IA de la conversación.
 *
 * Por qué existe aparte del agente: el agente responde UNA acción por turno
 * (FR-021), así que `update_lead` siempre pierde contra contestarle al cliente
 * y las notas dejaban de escribirse. Esta pasada corre DESPUÉS del turno, con
 * su propio modelo (el barato del juez si está configurado), y REGENERA la
 * ficha completa en vez de acumular líneas sueltas.
 *
 * Nunca lanza: es enriquecimiento: un hipo del proveedor no puede afectar la
 * conversación (constitución — todo turno tolera fallos del LLM).
 */

export const LeadProfile = z.object({
  /** Nombre real del contacto si lo dijo (no el del perfil de WhatsApp). */
  contactName: z.string().nullable().optional(),
  /** Nombre del negocio del cliente. */
  businessName: z.string().nullable().optional(),
  /** A qué se dedica el negocio. */
  businessType: z.string().nullable().optional(),
  /** Qué necesita, en frases cortas. */
  needs: z.array(z.string()).default([]),
  /** Presupuesto mencionado, tal cual lo dijo. */
  budget: z.string().nullable().optional(),
  /** Urgencia o plazo mencionado. */
  timeline: z.string().nullable().optional(),
  /** Resumen de una o dos frases para leer de un vistazo. */
  summary: z.string().nullable().optional(),
});
export type LeadProfileType = z.infer<typeof LeadProfile>;

/** ¿La ficha aporta algo? Evita guardar un objeto vacío que ensucie la UI. */
export function isProfileUseful(p: LeadProfileType): boolean {
  return Boolean(
    p.contactName?.trim() ||
      p.businessName?.trim() ||
      p.businessType?.trim() ||
      p.budget?.trim() ||
      p.timeline?.trim() ||
      p.summary?.trim() ||
      p.needs.some((n) => n.trim())
  );
}

/** Limpia strings vacíos/placeholder que devuelven algunos modelos. */
function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^(n\/?a|null|none|desconocido|no (se )?(sabe|especifica|menciona))$/i.test(v)) {
    return null;
  }
  return v;
}

/** Acepta la forma cruda del modelo (campos ausentes) y devuelve la ficha. */
export function normalizeProfile(
  p: z.input<typeof LeadProfile>
): LeadProfileType {
  return {
    contactName: clean(p.contactName),
    businessName: clean(p.businessName),
    businessType: clean(p.businessType),
    needs: (p.needs ?? [])
      .map((n) => (n ?? "").trim())
      .filter((n) => n.length > 0)
      .slice(0, 8),
    budget: clean(p.budget),
    timeline: clean(p.timeline),
    summary: clean(p.summary),
  };
}

const SYSTEM_PROMPT = [
  "Eres un analista de CRM. Lees la conversación de WhatsApp entre un negocio y",
  "un prospecto, y extraes una ficha del PROSPECTO para que el equipo comercial",
  "entienda el caso de un vistazo.",
  "",
  "Devuelves ÚNICAMENTE un objeto JSON con estas claves:",
  '{"contactName":"...","businessName":"...","businessType":"...",',
  '"needs":["..."],"budget":"...","timeline":"...","summary":"..."}',
  "",
  "Reglas:",
  "- SOLO información dicha explícitamente en la conversación. NO inventes ni",
  "  supongas: si un dato no aparece, pon null (y [] en needs).",
  "- `contactName`: cómo se llama la persona SI lo dijo en el chat.",
  "- `businessName` y `businessType`: el negocio DEL PROSPECTO, nunca el nuestro.",
  "- `needs`: qué pide o necesita, en frases cortas y concretas.",
  "- `summary`: una o dos frases en español, en tercera persona.",
  "- JSON puro, sin markdown ni texto adicional.",
].join("\n");

/**
 * Recalcula la ficha del contacto a partir del historial y la persiste.
 * Devuelve la ficha si se guardó algo; null si no había nada útil o el
 * proveedor falló.
 */
export async function refreshLeadProfile(input: {
  organizationId: string;
  contactId: string;
  conversationId: string;
  history: { direction: "in" | "out"; text: string | null }[];
}): Promise<LeadProfileType | null> {
  const inbound = input.history.filter((m) => m.direction === "in" && m.text);
  // Sin nada del cliente no hay nada que extraer (evita gastar una llamada).
  if (inbound.length === 0) return null;

  const transcript = input.history
    .filter((m) => m.text)
    .map((m) => `${m.direction === "in" ? "Cliente" : "Negocio"}: ${m.text}`)
    .join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Conversación:\n${transcript}` },
  ];

  // `judge: true` usa el modelo barato si hay uno configurado.
  const result = await chatJson(LeadProfile, messages, { judge: true });
  if (!result.ok) {
    console.warn(`[ficha-lead] no se pudo extraer: ${result.error}`);
    return null;
  }

  const profile = normalizeProfile(result.data);
  if (!isProfileUseful(profile)) return null;

  const db = getDb();
  await db
    .update(schema.contact)
    .set({
      aiProfile: JSON.stringify(profile),
      aiProfileAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.contact.id, input.contactId));

  publish(input.organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: input.conversationId } },
  });
  return profile;
}

/** Parseo tolerante para servir la ficha guardada (nunca rompe la UI). */
export function parseStoredProfile(raw: string | null): LeadProfileType | null {
  if (!raw) return null;
  try {
    const parsed = LeadProfile.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? normalizeProfile(parsed.data) : null;
  } catch {
    return null;
  }
}
