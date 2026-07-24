import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { isOrgAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

const patchSchema = z.object({
  role: z.enum(["owner", "agent_editor", "commercial", "marketing"]),
});

/** Cambia el rol de un miembro del equipo (admin only). La empresa nunca se
 * queda sin admin: el último owner no puede ser degradado. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!isOrgAdmin(session.role)) {
    return apiError(403, "forbidden", "Solo el admin asigna roles");
  }
  const { memberId } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, memberId),
        eq(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);
  const target = rows[0];
  if (!target) return apiError(404, "not_found", "Miembro no encontrado");

  if (target.role === "owner" && body.data.role !== "owner") {
    const others = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, session.organizationId),
          eq(schema.member.role, "owner"),
          ne(schema.member.id, memberId)
        )
      )
      .limit(1);
    if (others.length === 0) {
      return apiError(
        422,
        "last_admin",
        "La empresa no puede quedarse sin admin"
      );
    }
  }

  await db
    .update(schema.member)
    .set({ role: body.data.role })
    .where(eq(schema.member.id, memberId));
  return Response.json({ ok: true });
});
