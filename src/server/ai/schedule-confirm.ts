/**
 * Verificación determinística de que el CLIENTE confirmó la hora antes de
 * agendar: el modelo debe citar (clientOk) el mensaje del cliente donde
 * confirma o propone la fecha/hora, y aquí se comprueba que esa cita exista
 * de verdad en el historial entrante. Sin cita verificable → no se agenda.
 */

/** Colapsa a minúsculas alfanuméricas sin acentos: tolera puntuación y tildes. */
function squash(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Cita mínima para considerarse evidencia (evita "sí" como comodín). */
const MIN_QUOTE_LEN = 6;

export function quoteAppearsInInbound(
  quote: string | undefined,
  inboundTexts: string[]
): boolean {
  if (!quote) return false;
  const q = squash(quote);
  if (q.length < MIN_QUOTE_LEN) return false;
  return squash(inboundTexts.join(" ")).includes(q);
}
