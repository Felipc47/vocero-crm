import { desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { serializeContact } from "@/server/contacts";
import { onLeadActivity } from "@/server/inbox/lead-activity";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();
  // La etapa del lead viaja con cada contacto (tag de color del mock SEOMOS):
  // join de solo lectura contacto → lead → etapa, sin tocar el modelo.
  const rows = await db
    .select({
      contact: schema.contact,
      stage: {
        name: schema.pipelineStage.name,
        kind: schema.pipelineStage.kind,
        position: schema.pipelineStage.position,
      },
    })
    .from(schema.contact)
    .leftJoin(schema.lead, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        q
          ? or(
              ilike(schema.contact.name, `%${q}%`),
              ilike(schema.contact.phone, `%${q}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const contacts = rows
    .filter((r) => includeArchived || !r.contact.archivedAt)
    .map((r) => ({ ...serializeContact(r.contact), stage: r.stage ?? null }));
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  email: z.string().trim().email().max(254).optional(),
  notes: z.string().max(4000).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone: body.data.phone,
      email: body.data.email ?? null,
      notes: body.data.notes ?? null,
      // Alta a mano: sin consentimiento implícito hasta que el operador lo
      // confirme en la ficha (006).
      consentSource: "manual",
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }
  // Igual que la importación: el prospecto entra al pipeline de una vez.
  await onLeadActivity(session.organizationId, inserted[0].id, new Date());
  return Response.json(
    { contact: serializeContact(inserted[0]) },
    { status: 201 }
  );
});
