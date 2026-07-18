/**
 * Días hábiles (004): la disponibilidad que ofrece el agente empieza 48 horas
 * hábiles (= 2 días hábiles) después del contacto. Módulo puro y testeable.
 * Hábil = lunes a viernes SEGÚN LA ZONA HORARIA DEL NEGOCIO (una noche de
 * viernes en Bogotá ya es sábado en UTC — el conteo debe ser local).
 * Sin festivos en v1 — documentado en la spec.
 */

const DAY_MS = 24 * 3600_000;

/** Día de la semana ('Mon'…'Sun') de un instante, visto desde una zona IANA. */
function weekdayInTz(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(d);
}

function isBusinessDay(d: Date, timezone: string): boolean {
  const day = weekdayInTz(d, timezone);
  return day !== "Sat" && day !== "Sun";
}

/**
 * Suma N días hábiles conservando la hora local. Si el resultado cae en fin
 * de semana (posible cuando el punto de partida no era hábil), avanza al lunes.
 */
export function addBusinessDays(
  from: Date,
  days: number,
  timezone: string
): Date {
  const result = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setTime(result.getTime() + DAY_MS);
    if (isBusinessDay(result, timezone)) remaining--;
  }
  while (!isBusinessDay(result, timezone)) {
    result.setTime(result.getTime() + DAY_MS);
  }
  return result;
}

/** Primer momento agendable: 48 horas hábiles después de `now`. */
export function minSchedulableStart(now: Date, timezone: string): Date {
  return addBusinessDays(now, 2, timezone);
}
