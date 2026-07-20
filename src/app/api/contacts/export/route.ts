import { desc, eq } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { serializeCsv } from "@/lib/csv";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/** Descarga todos los contactos (incluidos archivados) como CSV. */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      contact: schema.contact,
      stageName: schema.pipelineStage.name,
    })
    .from(schema.contact)
    .leftJoin(schema.lead, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(scoped(schema.contact.organizationId, session.organizationId))
    .orderBy(desc(schema.contact.updatedAt));

  const csv = serializeCsv([
    ["nombre", "telefono", "correo", "notas", "etapa", "archivado"],
    ...rows.map((r) => [
      r.contact.name,
      r.contact.phone,
      r.contact.email ?? "",
      r.contact.notes ?? "",
      r.stageName ?? "",
      r.contact.archivedAt ? "sí" : "",
    ]),
  ]);

  // BOM para que Excel abra el UTF-8 (acentos) sin asistente.
  return new Response("\uFEFF" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="contactos.csv"',
    },
  });
});
