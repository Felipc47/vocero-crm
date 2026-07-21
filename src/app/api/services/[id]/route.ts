import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** null = volver al saludo global. */
  greetingTemplateId: z.string().trim().min(1).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // La plantilla debe ser de la organización (multi-tenancy).
  if (body.data.greetingTemplateId) {
    const tpl = await db
      .select({ id: schema.template.id })
      .from(schema.template)
      .where(
        scoped(
          schema.template.organizationId,
          session.organizationId,
          eq(schema.template.id, body.data.greetingTemplateId)
        )
      )
      .limit(1);
    if (!tpl[0]) {
      return apiError(404, "template_not_found", "Plantilla no encontrada");
    }
  }

  const updated = await db
    .update(schema.service)
    .set({
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.greetingTemplateId !== undefined
        ? { greetingTemplateId: body.data.greetingTemplateId }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.service.organizationId,
        session.organizationId,
        eq(schema.service.id, id)
      )
    )
    .returning();
  if (!updated[0]) {
    return apiError(404, "not_found", "Servicio no encontrado");
  }
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();
  const deleted = await db
    .delete(schema.service)
    .where(
      scoped(
        schema.service.organizationId,
        session.organizationId,
        eq(schema.service.id, id)
      )
    )
    .returning();
  if (!deleted[0]) {
    return apiError(404, "not_found", "Servicio no encontrado");
  }
  return Response.json({ ok: true });
});
