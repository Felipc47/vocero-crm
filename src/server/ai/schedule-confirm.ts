/**
 * Verificación determinística de que el CLIENTE confirmó la hora antes de
 * agendar. Dos evidencias independientes, cualquiera basta:
 *
 * 1. `quoteAppearsInInbound`: el modelo cita (clientOk) el mensaje donde el
 *    cliente confirma, y aquí se comprueba que esa cita exista de verdad.
 * 2. `inboundMentionsTime`: la hora que el modelo quiere agendar aparece
 *    mencionada por el cliente. NO depende de la cita del modelo.
 *
 * La (2) existe porque la (1) exige una cita de 6+ caracteres útiles para que
 * un "sí" suelto no sirva de comodín — y eso dejaba fuera confirmaciones
 * legítimas y cortísimas como "11 am" (→ "11am", 4 caracteres), obligando al
 * cliente a repetir la hora. Sin cita NI hora mencionada NO se agenda.
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

/**
 * Horas mencionadas en un texto, en minutos desde medianoche.
 *
 * Solo cuenta un número como hora si el contexto lo respalda: lleva meridiano
 * ("11 am"), minutos explícitos ("11:30"), va tras "a las"/"las"/"tipo", o el
 * mensaje ES el número ("11"). Así "tengo 11 empleados" NO se lee como las
 * 11:00 — el guard sigue protegiendo contra confirmaciones inventadas.
 */
export function parseTimeMentions(text: string): number[] {
  const out = new Set<number>();
  const bare = text.trim();
  const re =
    /(a\s+las|las|sobre\s+las|hacia\s+las|tipo)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/gi;

  for (const m of text.matchAll(re)) {
    const leadIn = m[1];
    const hour = Number(m[2]);
    const minuteRaw = m[3];
    const meridiem = m[4]?.toLowerCase().replace(/[.\s]/g, "");
    const minute = minuteRaw === undefined ? 0 : Number(minuteRaw);
    if (!Number.isFinite(hour) || hour > 23 || minute > 59) continue;

    // ¿El número está usado como hora? Sin señal de contexto se ignora.
    const isWholeMessage = /^\d{1,2}(?:[:.]\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/i.test(bare);
    const hasContext =
      Boolean(meridiem) ||
      minuteRaw !== undefined ||
      Boolean(leadIn) ||
      isWholeMessage;
    if (!hasContext) continue;

    if (meridiem?.startsWith("a")) {
      out.add((hour === 12 ? 0 : hour) * 60 + minute);
    } else if (meridiem?.startsWith("p")) {
      out.add((hour < 12 ? hour + 12 : hour) * 60 + minute);
    } else {
      // Sin meridiano: "11" es ambiguo. Se aceptan ambas lecturas para las
      // horas que caben en una jornada laboral (1–7 → también por la tarde);
      // la hora final igual debe coincidir con la que se va a agendar.
      out.add(hour * 60 + minute);
      if (hour >= 1 && hour <= 7) out.add((hour + 12) * 60 + minute);
    }
  }
  return [...out];
}

/**
 * ¿El cliente mencionó la hora que se pretende agendar?
 * `targetMinutes` = minutos desde medianoche EN LA ZONA DEL NEGOCIO.
 */
export function inboundMentionsTime(
  targetMinutes: number,
  inboundTexts: string[]
): boolean {
  return inboundTexts.some((t) => parseTimeMentions(t).includes(targetMinutes));
}
