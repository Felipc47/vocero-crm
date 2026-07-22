import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * Resolución de audiencia del envío masivo (005).
 *
 * Cuatro modos, todos con las mismas dos garantías: solo contactos de la
 * organización (scoped) y NUNCA archivados — los contactos sintéticos del
 * Laboratorio nacen archivados, así que quedan fuera por construcción, además
 * del guardrail duro de `sendTemplate`.
 */

export const audienceFilterSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({
    mode: z.literal("stages"),
    stageIds: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    mode: z.literal("services"),
    serviceIds: z.array(z.string().min(1)).min(1).max(50),
  }),
  z.object({
    mode: z.literal("manual"),
    contactIds: z.array(z.string().min(1)).min(1).max(5000),
  }),
]);

export type AudienceFilter = z.infer<typeof audienceFilterSchema>;

export type AudienceContact = {
  id: string;
  name: string;
  phone: string;
  consentSource: string | null;
  consentGrantedAt: Date | null;
};

/**
 * ¿Hay consentimiento para mensajes de MARKETING? Lo hay si el contacto llegó
 * por un canal que lo implica (llenó un formulario de Lead Ads o escribió él
 * mismo) o si el operador lo confirmó a mano en la ficha.
 */
export function hasMarketingConsent(c: AudienceContact): boolean {
  return (
    c.consentGrantedAt !== null ||
    c.consentSource === "meta_lead_ads" ||
    c.consentSource === "inbound_message"
  );
}

/**
 * Contactos destinatarios del filtro, deduplicados por id y ordenados.
 *
 * Excluye SIEMPRE a quien pidió la baja (política de Meta, 006) — en los
 * cuatro modos, incluida la selección manual: el operador no puede saltarse
 * una baja marcándolo a mano.
 */
export async function resolveAudience(
  organizationId: string,
  filter: AudienceFilter
): Promise<AudienceContact[]> {
  const db = getDb();
  const columns = {
    id: schema.contact.id,
    name: schema.contact.name,
    phone: schema.contact.phone,
    consentSource: schema.contact.consentSource,
    consentGrantedAt: schema.contact.consentGrantedAt,
  };
  const elegible = and(
    isNull(schema.contact.archivedAt),
    isNull(schema.contact.optedOutAt)
  )!;

  let rows: AudienceContact[];

  switch (filter.mode) {
    case "all":
      rows = await db
        .select(columns)
        .from(schema.contact)
        .where(
          scoped(schema.contact.organizationId, organizationId, elegible)
        )
        .orderBy(asc(schema.contact.name));
      break;

    case "manual":
      rows = await db
        .select(columns)
        .from(schema.contact)
        .where(
          scoped(
            schema.contact.organizationId,
            organizationId,
            elegible,
            inArray(schema.contact.id, filter.contactIds)
          )
        )
        .orderBy(asc(schema.contact.name));
      break;

    case "stages":
      rows = await db
        .selectDistinct(columns)
        .from(schema.contact)
        .innerJoin(schema.lead, eq(schema.lead.contactId, schema.contact.id))
        .where(
          scoped(
            schema.contact.organizationId,
            organizationId,
            elegible,
            eq(schema.lead.organizationId, organizationId),
            inArray(schema.lead.stageId, filter.stageIds)
          )
        )
        .orderBy(asc(schema.contact.name));
      break;

    case "services":
      // contacto → evento de Lead Ads → formulario → servicio
      rows = await db
        .selectDistinct(columns)
        .from(schema.contact)
        .innerJoin(
          schema.leadgenEvent,
          eq(schema.leadgenEvent.contactId, schema.contact.id)
        )
        .innerJoin(
          schema.serviceForm,
          and(
            eq(schema.serviceForm.formId, schema.leadgenEvent.formId),
            eq(schema.serviceForm.organizationId, organizationId)
          )
        )
        .where(
          scoped(
            schema.contact.organizationId,
            organizationId,
            elegible,
            eq(schema.leadgenEvent.organizationId, organizationId),
            inArray(schema.serviceForm.serviceId, filter.serviceIds)
          )
        )
        .orderBy(asc(schema.contact.name));
      break;
  }

  // selectDistinct ya deduplica, pero el modo manual puede traer ids repetidos.
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.id) && seen.add(r.id));
}
