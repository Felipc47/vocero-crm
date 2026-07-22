import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { parseCsv } from "@/lib/csv";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { onLeadActivity } from "@/server/inbox/lead-activity";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

const bodySchema = z.object({
  // El cliente lee el archivo y manda el texto tal cual (máx ~1 MB).
  csv: z.string().min(1).max(1_000_000),
});

/** Encabezados aceptados (insensibles a mayúsculas y tildes). */
const HEADER_ALIASES: Record<string, "name" | "phone" | "email" | "notes"> = {
  nombre: "name",
  name: "name",
  telefono: "phone",
  phone: "phone",
  celular: "phone",
  whatsapp: "phone",
  correo: "email",
  email: "email",
  notas: "notes",
  notes: "notes",
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Importa contactos desde CSV (plantilla en /plantilla-contactos.csv).
 * Idempotente: el teléfono repetido (en el archivo o en la BD) se cuenta como
 * duplicado y no toca el contacto existente. Cada contacto nuevo entra al
 * pipeline en la primera etapa abierta, igual que un lead de Meta.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const rows = parseCsv(body.data.csv);
  if (rows.length < 2) {
    return apiError(
      422,
      "empty",
      "El archivo no tiene filas de contactos (usa la plantilla como guía)"
    );
  }

  const header = rows[0]!.map((h) => HEADER_ALIASES[normalizeHeader(h)]);
  if (!header.includes("name") || !header.includes("phone")) {
    return apiError(
      422,
      "bad_header",
      'El encabezado debe incluir las columnas "nombre" y "telefono"'
    );
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return apiError(
      422,
      "too_large",
      `Máximo ${MAX_ROWS} contactos por importación (el archivo trae ${dataRows.length})`
    );
  }

  const db = getDb();
  let created = 0;
  let duplicates = 0;
  const invalid: number[] = [];
  const seenPhones = new Set<string>();

  for (const [i, row] of dataRows.entries()) {
    const record: Partial<Record<"name" | "phone" | "email" | "notes", string>> =
      {};
    header.forEach((key, col) => {
      if (key) record[key] = (row[col] ?? "").trim();
    });

    const phone = (record.phone ?? "").replace(/\D/g, "");
    const name = record.name || phone;
    if (!name || phone.length < 7 || phone.length > 15) {
      invalid.push(i + 2); // número de línea humano (1 = encabezado)
      continue;
    }
    if (seenPhones.has(phone)) {
      duplicates++;
      continue;
    }
    seenPhones.add(phone);

    const inserted = await db
      .insert(schema.contact)
      .values({
        id: newId("contact"),
        organizationId: session.organizationId,
        name,
        phone,
        email: record.email || null,
        notes: record.notes || null,
        // Lista importada: sin consentimiento registrado (006).
        consentSource: "imported",
      })
      .onConflictDoNothing({
        target: [schema.contact.organizationId, schema.contact.phone],
      })
      .returning();

    if (!inserted[0]) {
      duplicates++;
      continue;
    }
    created++;
    await onLeadActivity(session.organizationId, inserted[0].id, new Date());
  }

  return Response.json({ created, duplicates, invalid });
});
