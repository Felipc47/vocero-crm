import { describe, expect, it } from "vitest";
import {
  describeDeliveryError,
  translateStoredError,
} from "@/server/whatsapp/delivery-errors";

describe("traducción de errores de entrega de Meta", () => {
  it("código conocido → mensaje en español", () => {
    expect(describeDeliveryError({ code: 131049 })).toMatch(/marketing/);
    expect(describeDeliveryError({ code: 131026 })).toMatch(
      /no tiene WhatsApp/
    );
  });

  it("código desconocido → conserva el texto de Meta con el código", () => {
    expect(
      describeDeliveryError({ code: 999999, message: "Something odd" })
    ).toBe("Something odd (código 999999)");
  });

  it("sin datos → fallback genérico", () => {
    expect(describeDeliveryError(undefined)).toBe("Envío fallido");
    expect(describeDeliveryError({ code: 999999 })).toBe("Envío fallido");
  });

  it("texto en inglés ya guardado → se reconoce y traduce", () => {
    expect(
      translateStoredError(
        "This message was not delivered to maintain healthy ecosystem engagement."
      )
    ).toMatch(/marketing/);
    expect(translateStoredError("Message Undeliverable.")).toMatch(
      /no tiene WhatsApp/
    );
  });

  it("texto no reconocido → se devuelve tal cual", () => {
    expect(translateStoredError("Envío fallido")).toBe("Envío fallido");
  });
});
