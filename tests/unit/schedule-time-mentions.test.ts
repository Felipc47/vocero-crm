import { describe, expect, it } from "vitest";
import {
  inboundMentionsTime,
  parseTimeMentions,
  quoteAppearsInInbound,
} from "@/server/ai/schedule-confirm";

const H = (h: number, m = 0) => h * 60 + m;

describe("confirmación de hora por el cliente (respuestas cortas)", () => {
  it("el bug reportado: «11 am» confirma las 11:00", () => {
    // La cita del modelo NO alcanza el mínimo ("11am" = 4 caracteres)…
    expect(quoteAppearsInInbound("11 am", ["11 am"])).toBe(false);
    // …pero la hora mencionada por el cliente sí es evidencia válida.
    expect(inboundMentionsTime(H(11), ["11 am"])).toBe(true);
  });

  it("variantes cortas que antes obligaban a repetir la hora", () => {
    expect(inboundMentionsTime(H(11), ["11"])).toBe(true);
    expect(inboundMentionsTime(H(11), ["a las 11"])).toBe(true);
    expect(inboundMentionsTime(H(11), ["11 a.m."])).toBe(true);
    expect(inboundMentionsTime(H(11), ["11:00"])).toBe(true);
    expect(inboundMentionsTime(H(11, 30), ["11:30"])).toBe(true);
    expect(inboundMentionsTime(H(16, 30), ["4:30 pm"])).toBe(true);
    expect(inboundMentionsTime(H(9), ["las 9 am porfa"])).toBe(true);
  });

  it("sin meridiano acepta mañana y tarde para horas de jornada", () => {
    expect(inboundMentionsTime(H(16), ["a las 4"])).toBe(true);
    expect(inboundMentionsTime(H(4), ["a las 4"])).toBe(true);
    // 11 no se interpreta como 23:00 (fuera de cualquier jornada).
    expect(inboundMentionsTime(H(23), ["a las 11"])).toBe(false);
  });

  it("NO confunde números que no son horas (protección del guard)", () => {
    expect(inboundMentionsTime(H(11), ["tengo 11 empleados"])).toBe(false);
    expect(inboundMentionsTime(H(2), ["somos 2 socios"])).toBe(false);
    expect(inboundMentionsTime(H(23), ["el 23 de julio me sirve"])).toBe(false);
  });

  it("no confirma una hora distinta a la mencionada", () => {
    expect(inboundMentionsTime(H(9), ["11 am"])).toBe(false);
    expect(inboundMentionsTime(H(11, 30), ["11 am"])).toBe(false);
  });

  it("un «sí» suelto sigue sin valer como confirmación", () => {
    expect(inboundMentionsTime(H(11), ["sí", "ok", "dale"])).toBe(false);
    expect(quoteAppearsInInbound("sí", ["sí"])).toBe(false);
  });

  it("parseTimeMentions ignora horas imposibles", () => {
    expect(parseTimeMentions("a las 99")).toEqual([]);
    expect(parseTimeMentions("11:75")).toEqual([]);
  });

  it("la cita larga del modelo sigue funcionando", () => {
    expect(
      quoteAppearsInInbound("el viernes a las 11 me sirve", [
        "Perfecto, el viernes a las 11 me sirve",
      ])
    ).toBe(true);
  });
});
