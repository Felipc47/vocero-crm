/**
 * Guard determinístico contra respuestas repetidas del agente: si el texto a
 * enviar es idéntico (normalizado) al último saliente reciente de la misma
 * conversación, se suprime el envío. Red de seguridad bajo las reglas del
 * prompt — un "Gracias!" del cliente jamás debe re-disparar la misma
 * confirmación.
 *
 * La ventana de recencia se evalúa en SQL con el reloj de la BD (ver
 * deliverReply): comparar timestamps de Postgres contra Date.now() en JS
 * depende de la zona horaria del servidor y falla en entornos no-UTC.
 */

/** Ventana en la que un texto idéntico se considera repetición accidental. */
export const REPEAT_WINDOW_MIN = 15;

/** Normaliza para comparar: minúsculas, espacios colapsados. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Umbral de similitud (Dice sobre palabras) para considerar repetición. */
const NEAR_DUP_THRESHOLD = 0.9;
/** Bajo esta cantidad de palabras solo cuenta la igualdad exacta. */
const NEAR_DUP_MIN_TOKENS = 6;

/** Coeficiente de Dice entre multiconjuntos de palabras (0..1). */
function diceSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of b) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      common++;
      counts.set(t, c - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}

/**
 * ¿El borrador repite el texto del último saliente? Igualdad normalizada o
 * casi-duplicado (el modelo a veces varía una palabra — "una" vs "la" — y la
 * igualdad exacta no basta).
 */
export function isSameReplyText(
  draft: string,
  lastOutboundText: string | null | undefined
): boolean {
  if (!lastOutboundText) return false;
  const a = normalize(draft);
  const b = normalize(lastOutboundText);
  if (a === b) return true;
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length < NEAR_DUP_MIN_TOKENS || tb.length < NEAR_DUP_MIN_TOKENS) {
    return false;
  }
  return diceSimilarity(ta, tb) >= NEAR_DUP_THRESHOLD;
}
