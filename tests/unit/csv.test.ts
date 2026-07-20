import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "@/lib/csv";

describe("serializeCsv", () => {
  it("cita campos con comas, comillas y saltos", () => {
    const csv = serializeCsv([
      ["nombre", "notas"],
      ['Ana "La Jefa"', "vino ayer, pidió 2\nvuelve el lunes"],
    ]);
    expect(csv).toBe(
      'nombre,notas\r\n"Ana ""La Jefa""","vino ayer, pidió 2\nvuelve el lunes"'
    );
  });
});

describe("parseCsv", () => {
  it("hace roundtrip con serializeCsv", () => {
    const rows = [
      ["nombre", "telefono", "notas"],
      ["María López", "5215512345678", 'dijo "quizás", con acento'],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });

  it("acepta punto y coma como separador (Excel es-MX)", () => {
    const rows = parseCsv("nombre;telefono\r\nCarlos;573001234567\r\n");
    expect(rows).toEqual([
      ["nombre", "telefono"],
      ["Carlos", "573001234567"],
    ]);
  });

  it("ignora filas vacías y tolera LF simple", () => {
    const rows = parseCsv("a,b\n\n1,2\n,\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
