import { describe, expect, it } from "vitest";
import { quoteAppearsInInbound } from "@/server/ai/schedule-confirm";

const INBOUND = [
  "hola, quiero más información",
  "no tengo tiempo, agéndame mañana a las 2 pm a ceo@seomos.com gracias",
  "entonces el viernes a las 10 am",
];

describe("quoteAppearsInInbound", () => {
  it("acepta la cita textual de un mensaje del cliente", () => {
    expect(
      quoteAppearsInInbound("entonces el viernes a las 10 am", INBOUND)
    ).toBe(true);
  });

  it("tolera diferencias de tildes, mayúsculas y puntuación", () => {
    expect(
      quoteAppearsInInbound("¡Entonces el VIERNES a las 10 AM!", INBOUND)
    ).toBe(true);
    expect(quoteAppearsInInbound("agendame mañana a las 2 pm", INBOUND)).toBe(
      true
    );
  });

  it("rechaza citas inventadas por el modelo", () => {
    expect(
      quoteAppearsInInbound("perfecto, el lunes a las 9 me sirve", INBOUND)
    ).toBe(false);
  });

  it("rechaza cita ausente o demasiado corta para ser evidencia", () => {
    expect(quoteAppearsInInbound(undefined, INBOUND)).toBe(false);
    expect(quoteAppearsInInbound("", INBOUND)).toBe(false);
    expect(quoteAppearsInInbound("sí", INBOUND)).toBe(false);
  });
});
