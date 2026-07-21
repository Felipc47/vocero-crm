import { describe, expect, it } from "vitest";
import {
  extractLeadEmail,
  extractLeadName,
  extractLeadPhone,
} from "@/server/leadgen/fields";

describe("extractLeadPhone", () => {
  it("reconoce los nombres estándar", () => {
    expect(
      extractLeadPhone([{ name: "phone_number", values: ["+57 300 123 4567"] }])
    ).toBe("573001234567");
  });

  it("reconoce variantes por pista en el nombre (con tildes y espacios)", () => {
    expect(
      extractLeadPhone([
        { name: "Número de WhatsApp", values: ["3001234567"] },
      ])
    ).toBe("3001234567");
    expect(extractLeadPhone([{ name: "celular", values: ["3109876543"] }])).toBe(
      "3109876543"
    );
  });

  it("cae al valor con pinta de teléfono cuando el nombre no ayuda", () => {
    expect(
      extractLeadPhone([
        { name: "¿cómo te contactamos?", values: ["+52 1 55 1234 5678"] },
      ])
    ).toBe("5215512345678");
  });

  it("no confunde cédulas ni correos con teléfonos", () => {
    expect(
      extractLeadPhone([
        { name: "cedula", values: ["1012345678"] },
        { name: "email", values: ["a@b.com"] },
      ])
    ).toBeNull();
  });

  it("descarta valores no telefónicos (dummy data de la Testing Tool)", () => {
    expect(
      extractLeadPhone([
        { name: "phone_number", values: ["test lead: dummy data for phone_number"] },
      ])
    ).toBeNull();
  });
});

describe("extractLeadName / extractLeadEmail", () => {
  it("resuelve nombre y correo con nombres variados", () => {
    const fields = [
      { name: "Nombre completo", values: ["María López"] },
      { name: "correo_electronico", values: ["maria@test.com"] },
    ];
    expect(extractLeadName(fields)).toBe("María López");
    expect(extractLeadEmail(fields)).toBe("maria@test.com");
  });

  it("rechaza correos con formato inválido", () => {
    expect(
      extractLeadEmail([{ name: "email", values: ["dummy data"] }])
    ).toBeNull();
  });
});
