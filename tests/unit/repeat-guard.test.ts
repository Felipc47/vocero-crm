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
});
