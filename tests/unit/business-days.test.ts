import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  isValidMeetingStart,
  minSchedulableStart,
} from "@/lib/business-days";

const TZ = "America/Bogota"; // UTC-5, sin DST
const WORK = { leadDays: 2, workStartMin: 9 * 60 }; // jornada desde 9:00
const SLOTS = { workStartMin: 9 * 60, workEndMin: 17 * 60 + 30, slotMinutes: 30 };

describe("mínimo agendable (004): día + N hábiles al inicio de jornada", () => {
  it("contacto viernes por la NOCHE (ya sábado en UTC) → martes 9:00 a.m.", () => {
    // Este caso produjo el bucle real: el mínimo era 'martes 9:24 p.m.' y
    // rechazaba el 'martes 9:30 a.m.' que el modelo proponía.
    const friNight = new Date("2026-07-17T21:24:00-05:00");
    const r = minSchedulableStart(friNight, TZ, WORK);
    expect(r.toISOString()).toBe(
      new Date("2026-07-21T09:00:00-05:00").toISOString() // martes 9am
    );
  });

  it("contacto lunes 10 a.m. → miércoles 9:00 a.m.", () => {
    const mon = new Date("2026-07-20T10:00:00-05:00");
    const r = minSchedulableStart(mon, TZ, WORK);
    expect(r.toISOString()).toBe(
      new Date("2026-07-22T09:00:00-05:00").toISOString()
    );
  });

  it("contacto sábado → miércoles 9:00 a.m. (dom no cuenta, lun+mar hábiles)", () => {
    const sat = new Date("2026-07-18T09:00:00-05:00");
    const r = minSchedulableStart(sat, TZ, WORK);
    expect(r.toISOString()).toBe(
      new Date("2026-07-21T09:00:00-05:00").toISOString() // martes 9am
    );
  });

  it("addBusinessDays salta fines de semana", () => {
    const thu = new Date("2026-07-16T10:00:00-05:00"); // jueves
    const r = addBusinessDays(thu, 2, TZ);
    // A nivel día: viernes (1), lunes (2)
    expect(
      new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(r)
    ).toBe("Mon");
  });
});

describe("inicio válido: día hábil + horario 9:00-17:30 + franjas de 30", () => {
  it("martes 9:30 a.m. → válido (el caso que el bucle rechazaba)", () => {
    const d = new Date("2026-07-21T09:30:00-05:00");
    expect(isValidMeetingStart(d, TZ, SLOTS)).toBe(true);
  });

  it("martes 9:24 p.m. → inválido (fuera de horario)", () => {
    const d = new Date("2026-07-21T21:24:00-05:00");
    expect(isValidMeetingStart(d, TZ, SLOTS)).toBe(false);
  });

  it("17:00 es la última franja válida; 17:30 ya no inicia", () => {
    expect(
      isValidMeetingStart(new Date("2026-07-21T17:00:00-05:00"), TZ, SLOTS)
    ).toBe(true);
    expect(
      isValidMeetingStart(new Date("2026-07-21T17:30:00-05:00"), TZ, SLOTS)
    ).toBe(false);
  });

  it("9:15 no es franja de 30 → inválido; sábado → inválido", () => {
    expect(
      isValidMeetingStart(new Date("2026-07-21T09:15:00-05:00"), TZ, SLOTS)
    ).toBe(false);
    expect(
      isValidMeetingStart(new Date("2026-07-18T10:00:00-05:00"), TZ, SLOTS)
    ).toBe(false);
  });
});
