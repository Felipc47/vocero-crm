import { describe, expect, it } from "vitest";
import { nextFreeSlots, overlapsBusy } from "@/lib/business-days";

const TZ = "America/Bogota";
const BASE = {
  timezone: TZ,
  workStartMin: 9 * 60,
  workEndMin: 17 * 60 + 30,
  slotMinutes: 30,
  durationMin: 30,
  count: 3,
};

// Lunes 27 de julio de 2026, 9:00 a.m. Bogotá.
const MONDAY_9 = new Date("2026-07-27T09:00:00-05:00");

function iso(d: Date): string {
  return d.toISOString();
}

describe("nextFreeSlots", () => {
  it("sin ocupados propone las primeras franjas de la jornada", () => {
    const slots = nextFreeSlots({ ...BASE, from: MONDAY_9, busy: [] });
    expect(slots.map(iso)).toEqual([
      "2026-07-27T14:00:00.000Z", // 9:00 Bogotá
      "2026-07-27T14:30:00.000Z", // 9:30
      "2026-07-27T15:00:00.000Z", // 10:00
    ]);
  });

  it("salta la franja exacta ocupada", () => {
    const busy = [
      {
        start: new Date("2026-07-27T09:00:00-05:00"),
        end: new Date("2026-07-27T09:30:00-05:00"),
      },
    ];
    const slots = nextFreeSlots({ ...BASE, from: MONDAY_9, busy });
    expect(iso(slots[0]!)).toBe("2026-07-27T14:30:00.000Z"); // 9:30
  });

  it("un ocupado que cruza dos franjas bloquea ambas", () => {
    const busy = [
      {
        start: new Date("2026-07-27T09:15:00-05:00"),
        end: new Date("2026-07-27T09:45:00-05:00"),
      },
    ];
    const slots = nextFreeSlots({ ...BASE, from: MONDAY_9, busy });
    expect(iso(slots[0]!)).toBe("2026-07-27T15:00:00.000Z"); // 10:00
  });

  it("al final de la jornada del viernes salta al lunes", () => {
    // Viernes 31 de julio de 2026, 17:00 (última franja del día).
    const fridayLate = new Date("2026-07-31T17:00:00-05:00");
    const slots = nextFreeSlots({ ...BASE, from: fridayLate, busy: [] });
    expect(slots.map(iso)).toEqual([
      "2026-07-31T22:00:00.000Z", // viernes 17:00 Bogotá
      "2026-08-03T14:00:00.000Z", // lunes 9:00
      "2026-08-03T14:30:00.000Z", // lunes 9:30
    ]);
  });
});

describe("overlapsBusy", () => {
  const busy = [
    {
      start: new Date("2026-07-27T10:00:00-05:00"),
      end: new Date("2026-07-27T10:30:00-05:00"),
    },
  ];

  it("detecta el choque parcial y respeta los bordes", () => {
    const s = (h: string) => new Date(`2026-07-27T${h}:00-05:00`);
    expect(overlapsBusy(s("10:15"), s("10:45"), busy)).toBe(true);
    expect(overlapsBusy(s("09:30"), s("10:00"), busy)).toBe(false); // borde
    expect(overlapsBusy(s("10:30"), s("11:00"), busy)).toBe(false); // borde
  });
});
