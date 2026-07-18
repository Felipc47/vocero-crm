import { describe, expect, it } from "vitest";
import { addBusinessDays, minSchedulableStart } from "@/lib/business-days";

const TZ = "America/Bogota"; // UTC-5, sin DST

describe("días hábiles (004): disponibilidad 48h hábiles en la zona del negocio", () => {
  it("lunes + 2 hábiles → miércoles, misma hora", () => {
    const mon = new Date("2026-07-20T15:00:00-05:00"); // lunes 10am Bogotá
    const r = addBusinessDays(mon, 2, TZ);
    expect(r.toISOString()).toBe(
      new Date("2026-07-22T15:00:00-05:00").toISOString() // miércoles
    );
  });

  it("jueves + 2 hábiles salta el fin de semana → lunes", () => {
    const thu = new Date("2026-07-16T10:00:00-05:00"); // jueves
    const r = addBusinessDays(thu, 2, TZ);
    expect(r.toISOString()).toBe(
      new Date("2026-07-20T10:00:00-05:00").toISOString() // lunes
    );
  });

  it("viernes por la NOCHE en Bogotá (ya sábado en UTC) + 2 hábiles → martes", () => {
    // 2026-07-17 20:57 Bogotá = 2026-07-18 01:57 UTC (sábado en UTC)
    const friNight = new Date("2026-07-17T20:57:00-05:00");
    const r = addBusinessDays(friNight, 2, TZ);
    expect(r.toISOString()).toBe(
      new Date("2026-07-21T20:57:00-05:00").toISOString() // martes, no lunes
    );
  });

  it("sábado (local) + 2 hábiles → martes", () => {
    const sat = new Date("2026-07-18T09:00:00-05:00"); // sábado 9am Bogotá
    const r = addBusinessDays(sat, 2, TZ);
    expect(r.toISOString()).toBe(
      new Date("2026-07-21T09:00:00-05:00").toISOString() // martes
    );
  });

  it("minSchedulableStart = now + 2 hábiles", () => {
    const now = new Date("2026-07-20T12:00:00-05:00"); // lunes
    expect(minSchedulableStart(now, TZ).toISOString()).toBe(
      new Date("2026-07-22T12:00:00-05:00").toISOString()
    );
  });
});
