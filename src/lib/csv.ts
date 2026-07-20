/**
 * CSV mínimo para importar/exportar contactos (RFC 4180): comillas, comas o
 * punto y coma (Excel en español exporta con ";"), saltos CRLF. Sin
 * dependencias externas (Constitución II).
 */

/** Serializa filas a CSV con coma; cita lo que lo necesite. */
export function serializeCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) =>
          /[",;\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field
        )
        .join(",")
    )
    .join("\r\n");
}

/** Detecta el separador mirando la primera línea (Excel es-MX usa ";"). */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || text.length);
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ",") commas++;
    else if (!inQuotes && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** Parsea CSV a filas; ignora filas totalmente vacías. */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}
