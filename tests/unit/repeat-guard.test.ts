import { describe, expect, it } from "vitest";
import { isSameReplyText } from "@/server/ai/repeat-guard";

const CONFIRM =
  "He agendado la reunión para el miércoles 22 de julio a las 4:00 p.m. Te llegará una invitación al correo. ¡Nos vemos pronto!";

describe("isSameReplyText", () => {
  it("detecta el texto idéntico", () => {
    expect(isSameReplyText(CONFIRM, CONFIRM)).toBe(true);
  });

  it("ignora mayúsculas y espacios al comparar", () => {
    const variante =
      "  he agendado la reunión para el miércoles 22 de julio a las 4:00 p.m.   Te llegará una invitación al correo. ¡nos vemos pronto!  ";
    expect(isSameReplyText(variante, CONFIRM)).toBe(true);
  });

  it("permite un texto distinto", () => {
    expect(
      isSameReplyText("¡Con mucho gusto! Nos vemos en la reunión.", CONFIRM)
    ).toBe(false);
  });

  it("permite cuando no hay saliente previo o no tiene texto", () => {
    expect(isSameReplyText(CONFIRM, null)).toBe(false);
    expect(isSameReplyText(CONFIRM, undefined)).toBe(false);
    expect(isSameReplyText(CONFIRM, "")).toBe(false);
  });

  it("detecta el casi-duplicado con una palabra cambiada (caso real una/la)", () => {
    const a =
      "Podemos desarrollar una tienda virtual para que tus clientes vean los juguetes, hagan el pedido y paguen desde la página. ¿Te gustaría agendar una reunión sin costo para revisar el alcance?";
    const b =
      "Podemos desarrollar la tienda virtual para que tus clientes vean los juguetes, hagan el pedido y paguen desde la página. ¿Te gustaría agendar una reunión sin costo para revisar el alcance?";
    expect(isSameReplyText(a, b)).toBe(true);
  });

  it("no confunde respuestas genuinamente distintas", () => {
    expect(
      isSameReplyText(
        "El jueves tengo libre de 9:00 a. m. a 11:30 a. m. ¿Te funciona alguna de esas horas para la reunión?",
        "Para enviarte la invitación necesito tu correo electrónico. ¿Me lo compartes por aquí?"
      )
    ).toBe(false);
  });

  it("en textos cortos exige igualdad exacta (no similitud)", () => {
    expect(isSameReplyText("¡Con mucho gusto!", "¡Con mucho gusto!")).toBe(true);
    expect(isSameReplyText("¡Con mucho gusto!", "¡Con gusto!")).toBe(false);
  });
});
