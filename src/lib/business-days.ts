/**
 * Días hábiles y horario de agendamiento (004): la disponibilidad que ofrece
 * el agente empieza N días hábiles después del contacto, AL INICIO DE LA
 * JORNADA (no a la hora exacta del contacto — eso producía mínimos absurdos
 * como "martes 9:24 p.m."). Todo se evalúa en la zona horaria del negocio.
 * Hábil = lunes a viernes; sin festivos en v1 — documentado en la spec.
 */

const DAY_MS = 24 * 3600_000;

/** Día de la semana ('Mon'…'Sun') de un instante, visto desde una zona IANA. */
function weekdayInTz(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(d);
}

export function isBusinessDay(d: Date, timezone: string): boolean {
  const day = weekdayInTz(d, timezone);
  return day !== "Sat" && day !== "Sun";
}

/** Offset UTC de la zona en un instante (ej. "-05:00"). */
export function utcOffsetOf(timezone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-5" | "GMT-05:30"
  const m = part?.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "-05:00";
  const sign = m[1] ?? "-";
  const hh = (m[2] ?? "5").padStart(2, "0");
  const mm = m[3] ?? "00";
  return `${sign}${hh}:${mm}`;
}

/** Fecha local (y-m-d) de un instante en la zona. */
function localDateParts(
  d: Date,
  timezone: string
): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Instante correspondiente a `minutes` desde medianoche LOCAL del día de `d`. */
export function atLocalTime(
  d: Date,
  minutes: number,
  timezone: string
): Date {
  const { y, m, d: day } = localDateParts(d, timezone);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  // El offset puede variar por DST: se calcula sobre el mismo día.
  const offset = utcOffsetOf(timezone, d);
  return new Date(`${y}-${m}-${day}T${hh}:${mm}:00${offset}`);
}

/** Minutos desde la medianoche local de un instante en la zona. */
export function localMinutesOfDay(d: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  return get("hour") * 60 + get("minute");
}

/** Avanza N días hábiles A NIVEL DE DÍA (la hora resultante no importa). */
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

/**
 * Primer momento agendable: `leadDays` días hábiles después del contacto,
 * al INICIO de la jornada laboral (workStartMin, minutos locales).
 * Contacto viernes 9:24 p.m. Bogotá → martes 9:00 a.m.
 */
export function minSchedulableStart(
  now: Date,
  timezone: string,
  opts: { leadDays: number; workStartMin: number }
): Date {
  const day = addBusinessDays(now, opts.leadDays, timezone);
  return atLocalTime(day, opts.workStartMin, timezone);
}

/**
 * ¿El inicio propuesto cae en día hábil, dentro del horario laboral y en una
 * franja válida (:00/:30 con slot de 30)? El último inicio permitido deja
 * espacio para una franja completa antes del cierre.
 */
export function isValidMeetingStart(
  start: Date,
  timezone: string,
  opts: { workStartMin: number; workEndMin: number; slotMinutes: number }
): boolean {
  if (!isBusinessDay(start, timezone)) return false;
  const minutes = localMinutesOfDay(start, timezone);
  if (minutes < opts.workStartMin) return false;
  if (minutes > opts.workEndMin - opts.slotMinutes) return false;
  return (minutes - opts.workStartMin) % opts.slotMinutes === 0;
}
