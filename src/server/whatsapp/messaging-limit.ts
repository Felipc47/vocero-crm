import { graphRequest, MetaApiError } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

/**
 * Límite de mensajería del número (006).
 *
 * Meta acota cuántas CONVERSACIONES NUEVAS puede iniciar un número en una
 * ventana móvil de 24 h. No es el límite técnico de tasa (80 msg/s): un envío
 * masivo a ritmo lento puede seguir excediéndolo, porque cuenta destinatarios
 * únicos, no velocidad.
 */

export type MessagingLimit = {
  /** Valor crudo de Meta, p. ej. `TIER_1K`. `null` si no se pudo leer. */
  tier: string | null;
  /** Conversaciones nuevas por 24 h. `null` = desconocido; `Infinity` = sin tope. */
  cap: number | null;
};

/** Traduce el escalón de Meta al número de conversaciones por 24 h. */
export function capFromTier(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const normalized = tier.toUpperCase();
  if (normalized.includes("UNLIMITED")) return Number.POSITIVE_INFINITY;
  const match = /TIER_(\d+)(K|M)?/.exec(normalized);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const factor = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : 1;
  return base * factor;
}

/**
 * Lee el escalón actual del número. Nunca lanza: si Meta no responde o el
 * campo no viene, se devuelve `null` y la UI simplemente no avisa — un aviso
 * ausente no debe impedir enviar.
 */
export async function getMessagingLimit(
  organizationId: string
): Promise<MessagingLimit> {
  const credentials = await getCredentialsByOrg(organizationId);
  if (!credentials) return { tier: null, cap: null };

  try {
    const res = await graphRequest<{ messaging_limit_tier?: string }>(
      `${credentials.phoneNumberId}?fields=messaging_limit_tier`,
      { token: credentials.token }
    );
    const tier = res.messaging_limit_tier ?? null;
    return { tier, cap: capFromTier(tier) };
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    console.warn("[campaigns] no se pudo leer el límite de mensajería:", err.message);
    return { tier: null, cap: null };
  }
}

/** Etiqueta legible del escalón para la interfaz. */
export function formatCap(cap: number | null): string | null {
  if (cap === null) return null;
  if (!Number.isFinite(cap)) return "sin límite";
  return `${cap.toLocaleString("es-CO")} por 24 h`;
}
