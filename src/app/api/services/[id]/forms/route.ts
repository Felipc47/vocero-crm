import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  formId: z.string().trim().min(1).max(64),
});

/** Vincula un formulario al servicio (lo re-vincula si estaba en otro). */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const svc = await db
    .select({ id: schema.service.id })
    .from(schema.service)
    .where(
      scoped(
        schema.service.organizationId,
        session.organizationId,
        eq(schema.service.id, id)
      )
    )
    .limit(1);
  if (!svc[0]) return apiError(404, "not_found", "Servicio no encontrado");

  // Un form pertenece a UN servicio: mover = borrar el vínculo anterior.
  await db
    .delete(schema.serviceForm)
    .where(
      and(
        eq(schema.serviceForm.organizationId, session.organizationId),
        eq(schema.serviceForm.formId, body.data.formId)
      )
    );
  await db.insert(schema.serviceForm).values({
    id: newId("serviceForm"),
    organizationId: session.organizationId,
    serviceId: id,
    formId: body.data.formId,
  });
  return Response.json({ ok: true }, { status: 201 });
});

/** Desvincula un formulario del servicio. */
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  await db
    .delete(schema.serviceForm)
    .where(
      and(
        eq(schema.serviceForm.organizationId, session.organizationId),
        eq(schema.serviceForm.serviceId, id),
        eq(schema.serviceForm.formId, body.data.formId)
      )
    );
  return Response.json({ ok: true });
});
