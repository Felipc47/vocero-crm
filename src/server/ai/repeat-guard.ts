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

/** ¿El borrador repite (normalizado) el texto del último saliente? */
export function isSameReplyText(
  draft: string,
  lastOutboundText: string | null | undefined
): boolean {
  if (!lastOutboundText) return false;
  return normalize(draft) === normalize(lastOutboundText);
}
