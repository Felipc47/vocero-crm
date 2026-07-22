import { describe, expect, it } from "vitest";
import { detectOptOut } from "@/server/inbox/opt-out";

describe("detectOptOut (solicitudes de baja)", () => {
  it("detecta las frases inequívocas en español", () => {
    const bajas = [
      "No me escriban más por favor",
      "no quiero recibir más mensajes",
      "Quiero darme de baja",
      "me doy de baja",
      "dejen de escribirme",
      "Deja de mandarme cosas",
      "eliminen mi número de su lista",
      "borren mi contacto",
      "Cancelar suscripción",
      "No me vuelvan a escribir",
      "déjenme en paz",
      "no deseo recibir publicidad",
    ];
    for (const texto of bajas) {
      expect(detectOptOut(texto), texto).not.toBeNull();
    }
  });

  it("detecta las frases en inglés", () => {
    for (const texto of [
      "unsubscribe",
      "Please remove me from your list",
      "stop messaging me",
      "don't contact me again",
      "I want to opt out",
    ]) {
      expect(detectOptOut(texto), texto).not.toBeNull();
    }
  });

  it("acepta palabras clave SOLO cuando son todo el mensaje", () => {
    expect(detectOptOut("STOP")).not.toBeNull();
    expect(detectOptOut("baja")).not.toBeNull();
    // …pero dentro de una frase normal no significan baja.
    expect(detectOptOut("¿Hacen envíos a Baja California?")).toBeNull();
    expect(detectOptOut("El precio de baja temporada cuál es")).toBeNull();
    expect(detectOptOut("Voy a cancelar la cita del martes")).toBeNull();
  });

  it("NO marca baja en conversación normal (falsos positivos)", () => {
    const normales = [
      "Hola, quiero información",
      "¿Me pueden escribir mañana?",
      "Sí, escríbanme el lunes por favor",
      "No, gracias",
      "no",
      "para cuándo tienen disponibilidad",
      "¿Cuánto cuesta el servicio?",
      "Quiero recibir la cotización",
      "no quiero recibir la factura en papel, mejor digital",
      "¿Puedo dar de alta otro número?",
    ];
    for (const texto of normales) {
      expect(detectOptOut(texto), texto).toBeNull();
    }
  });

  it("tolera acentos, mayúsculas y puntuación", () => {
    expect(detectOptOut("¡NO ME ESCRIBAN MÁS!")).not.toBeNull();
    expect(detectOptOut("Darme de baja.")).not.toBeNull();
  });

  it("ignora vacíos y no-texto", () => {
    expect(detectOptOut(null)).toBeNull();
    expect(detectOptOut(undefined)).toBeNull();
    expect(detectOptOut("")).toBeNull();
    expect(detectOptOut("   ")).toBeNull();
  });

  it("devuelve el texto original como motivo", () => {
    expect(detectOptOut("No me escriban más")).toBe("No me escriban más");
  });
});
