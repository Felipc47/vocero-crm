import { describe, expect, it } from "vitest";
import {
  isProfileUseful,
  normalizeProfile,
  parseStoredProfile,
} from "@/server/ai/lead-profile";

describe("ficha del lead extraída por IA", () => {
  it("limpia placeholders que devuelven los modelos", () => {
    const p = normalizeProfile({
      contactName: "N/A",
      businessName: "  ",
      businessType: "no se menciona",
      needs: ["  ", "Página web"],
      budget: "null",
      summary: "Dueño de panadería.",
    });
    expect(p.contactName).toBeNull();
    expect(p.businessName).toBeNull();
    expect(p.businessType).toBeNull();
    expect(p.budget).toBeNull();
    expect(p.needs).toEqual(["Página web"]);
    expect(p.summary).toBe("Dueño de panadería.");
  });

  it("tolera campos ausentes (el modelo no siempre manda todo)", () => {
    const p = normalizeProfile({});
    expect(p.needs).toEqual([]);
    expect(p.summary).toBeNull();
    expect(isProfileUseful(p)).toBe(false);
  });

  it("una ficha vacía no se considera útil y no debe guardarse", () => {
    expect(isProfileUseful(normalizeProfile({ needs: [] }))).toBe(false);
    expect(
      isProfileUseful(normalizeProfile({ needs: [], businessName: "  " }))
    ).toBe(false);
    expect(isProfileUseful(normalizeProfile({ needs: ["Web"] }))).toBe(true);
    expect(isProfileUseful(normalizeProfile({ summary: "Algo" }))).toBe(true);
  });

  it("acota la lista de necesidades", () => {
    const p = normalizeProfile({
      needs: Array.from({ length: 20 }, (_, i) => `n${i}`),
    });
    expect(p.needs).toHaveLength(8);
  });

  it("parseo tolerante: JSON inválido no rompe la UI", () => {
    expect(parseStoredProfile(null)).toBeNull();
    expect(parseStoredProfile("{no es json")).toBeNull();
    expect(parseStoredProfile('{"needs":["Web"],"summary":"x"}')).toEqual({
      contactName: null,
      businessName: null,
      businessType: null,
      needs: ["Web"],
      budget: null,
      timeline: null,
      summary: "x",
    });
  });
});
