/**
 * Extracción robusta de los campos de un lead de Meta (field_data): cada
 * formulario nombra sus preguntas distinto ("phone_number", "celular",
 * "número_de_whatsapp"…), así que se resuelve por nombre exacto → nombre que
 * contenga una pista → (solo teléfono) cualquier campo cuyo valor parezca un
 * número, excluyendo campos que claramente no lo son (cédula, correo…).
 */

export type LeadField = { name?: string; values?: string[] };

/** minúsculas sin tildes, separadores unificados a "_". */
function squash(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function valueOf(f: LeadField): string | null {
  const v = f.values?.[0]?.trim();
  return v || null;
}

function byExact(fields: LeadField[], names: string[]): string | null {
  for (const n of names) {
    const f = fields.find((x) => x.name && squash(x.name) === n);
    const v = f && valueOf(f);
    if (v) return v;
  }
  return null;
}

function byContains(fields: LeadField[], hints: string[]): string | null {
  for (const hint of hints) {
    const f = fields.find((x) => x.name && squash(x.name).includes(hint));
    const v = f && valueOf(f);
    if (v) return v;
  }
  return null;
}

/** Teléfono del form → dígitos con código de país (formato del CRM). */
export function normalizeLeadPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** Campos que jamás deben interpretarse como teléfono en el fallback. */
const PHONE_BLOCKLIST = [
  "mail",
  "correo",
  "cedula",
  "documento",
  "dni",
  "nit",
  "fecha",
  "date",
  "edad",
  "age",
  "id",
];

export function extractLeadPhone(fields: LeadField[]): string | null {
  const named =
    byExact(fields, ["phone_number", "telefono", "phone"]) ??
    byContains(fields, [
      "whatsapp",
      "telefono",
      "phone",
      "celular",
      "movil",
      "mobile",
      "cel",
    ]);
  if (named) {
    const normalized = normalizeLeadPhone(named);
    if (normalized) return normalized;
  }
  // Último recurso: cualquier campo cuyo valor sea un número telefónico y
  // cuyo nombre no sugiera otra cosa (cédula, correo, fecha…).
  for (const f of fields) {
    const name = f.name ? squash(f.name) : "";
    if (PHONE_BLOCKLIST.some((b) => name.includes(b))) continue;
    const v = valueOf(f);
    const normalized = v ? normalizeLeadPhone(v) : null;
    if (normalized) return normalized;
  }
  return null;
}

export function extractLeadName(fields: LeadField[]): string | null {
  return (
    byExact(fields, ["full_name", "nombre", "name"]) ??
    byContains(fields, ["nombre", "name"])
  );
}

export function extractLeadEmail(fields: LeadField[]): string | null {
  const v =
    byExact(fields, ["email", "correo"]) ?? byContains(fields, ["mail", "correo"]);
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}
