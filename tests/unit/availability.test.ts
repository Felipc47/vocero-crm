import { describe, expect, it } from "vitest";
import { freeRangesByDay } from "@/lib/business-days";
import { buildAvailabilityLabel } from "@/server/ai/pipeline";

const TZ = "America/Bogota";
const BASE = {
  timezone: TZ,
  workStartMin: 9 * 60,
  workEndMin: 17 * 60 + 30,
  slotMinutes: 30,
};

// Lunes 27 de julio de 2026, 9:00 a.m. Bogotá.
const MONDAY_9 = new Date("2026-07-27T09:00:00-05:00");

describe("freeRangesByDay", () => {
  it("día libre completo → un solo rango de jornada", () => {
    const [day] = freeRangesByDay({
      ...BASE,
      from: MONDAY_9,
      busy: [],
      businessDays: 1,
    });
    expect(day!.ranges).toHaveLength(1);
    expect(day!.ranges[0]!.start.toISOString()).toBe("2026-07-27T14:00:00.000Z"); // 9:00
    expect(day!.ranges[0]!.end.toISOString()).toBe("2026-07-27T22:30:00.000Z"); // 17:30
  });

  it("una reunión parte el día en dos rangos", () => {
    const busy = [
      {
        start: new Date("2026-07-27T10:00:00-05:00"),
        end: new Date("2026-07-27T11:00:00-05:00"),
      },
    ];
    const [day] = freeRangesByDay({
      ...BASE,
      from: MONDAY_9,
      busy,
      businessDays: 1,
    });
    expect(
      day!.ranges.map((r) => [r.start.toISOString(), r.end.toISOString()])
    ).toEqual([
      ["2026-07-27T14:00:00.000Z", "2026-07-27T15:00:00.000Z"], // 9:00–10:00
      ["2026-07-27T16:00:00.000Z", "2026-07-27T22:30:00.000Z"], // 11:00–17:30
    ]);
  });

  it("día completamente ocupado → sin rangos", () => {
    const busy = [
      {
        start: new Date("2026-07-28T00:00:00-05:00"),
        end: new Date("2026-07-29T00:00:00-05:00"),
      },
    ];
    const days = freeRangesByDay({
      ...BASE,
      from: MONDAY_9,
      busy,
      businessDays: 2,
    });
    expect(days[1]!.ranges).toHaveLength(0); // martes 28 bloqueado
  });

  it("salta fines de semana y respeta el conteo de días hábiles", () => {
    // Viernes 31 de julio 9:00 → viernes, lunes 3, martes 4.
    const friday = new Date("2026-07-31T09:00:00-05:00");
    const days = freeRangesByDay({
      ...BASE,
      from: friday,
      busy: [],
      businessDays: 3,
    });
    const labels = days.map((d) =>
      d.day.toLocaleDateString("es-CO", { timeZone: TZ, weekday: "long" })
    );
    expect(labels).toEqual(["viernes", "lunes", "martes"]);
  });
});

describe("buildAvailabilityLabel", () => {
  it("escribe rangos libres y marca días sin disponibilidad", () => {
    const busy = [
      {
        start: new Date("2026-07-28T00:00:00-05:00"),
        end: new Date("2026-07-29T00:00:00-05:00"),
      },
      {
        start: new Date("2026-07-27T10:00:00-05:00"),
        end: new Date("2026-07-27T11:00:00-05:00"),
      },
    ];
    const days = freeRangesByDay({
      ...BASE,
      from: MONDAY_9,
      busy,
      businessDays: 2,
    });
    const label = buildAvailabilityLabel(days, TZ);
    expect(label).toContain("lunes, 27 de julio: libre de");
    expect(label).toContain("y de");
    expect(label).toContain("martes, 28 de julio: SIN disponibilidad");
  });
});
