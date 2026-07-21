import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/**
 * Servicios del negocio (Ajustes → Servicios): cada uno agrupa formularios de
 * Meta Lead Ads y define la plantilla de saludo de sus leads. El GET incluye
 * los formularios DETECTADOS (form_id vistos en eventos leadgen) para
 * vincularlos con un clic en vez de copiar ids a mano.
 */
export const GET = withAuth(async (session) => {
  const db = getDb();

  const services = await db
    .select({
      id: schema.service.id,
      name: schema.service.name,
      greetingTemplateId: schema.service.greetingTemplateId,
      templateName: schema.template.name,
    })
    .from(schema.service)
    .leftJoin(
      schema.template,
      eq(schema.template.id, schema.service.greetingTemplateId)
    )
    .where(scoped(schema.service.organizationId, session.organizationId))
    .orderBy(asc(schema.service.createdAt));

  const links = await db
    .select({
      serviceId: schema.serviceForm.serviceId,
      formId: schema.serviceForm.formId,
    })
    .from(schema.serviceForm)
    .where(scoped(schema.serviceForm.organizationId, session.organizationId));

  const detected = await db
    .select({
      formId: schema.leadgenEvent.formId,
      leads: sql<number>`count(*)::int`,
      lastAt: sql<string>`max(${schema.leadgenEvent.createdAt})::text`,
    })
    .from(schema.leadgenEvent)
    .where(
      scoped(
        schema.leadgenEvent.organizationId,
        session.organizationId,
        isNotNull(schema.leadgenEvent.formId)
      )
    )
    .groupBy(schema.leadgenEvent.formId)
    .orderBy(desc(sql`max(${schema.leadgenEvent.createdAt})`))
    .limit(50);

  const linkedForms = new Set(links.map((l) => l.formId));
  return Response.json({
    services: services.map((s) => ({
      ...s,
      forms: links.filter((l) => l.serviceId === s.id).map((l) => l.formId),
    })),
    detectedForms: detected
      .filter((d) => d.formId)
      .map((d) => ({
        formId: d.formId!,
        leads: d.leads,
        lastAt: d.lastAt,
        linked: linkedForms.has(d.formId!),
      })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const inserted = await db
    .insert(schema.service)
    .values({
      id: newId("service"),
      organizationId: session.organizationId,
      name: body.data.name,
    })
    .returning();
  if (!inserted[0]) {
    return apiError(500, "insert_failed", "No se pudo crear el servicio");
  }
  return Response.json(
    { service: { id: inserted[0].id, name: inserted[0].name } },
    { status: 201 }
  );
});
