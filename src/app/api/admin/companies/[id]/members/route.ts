import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Equipo de cualquier empresa, para el superadmin (asignación de roles). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const { id } = await ctx.params;
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.member.createdAt,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, id))
    .orderBy(schema.member.createdAt);
  return Response.json({
    members: members.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const patchSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(["owner", "agent_editor", "commercial", "marketing"]),
});

/** Cambia el rol de un miembro de cualquier empresa (superadmin). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, body.data.memberId),
        eq(schema.member.organizationId, id)
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
          eq(schema.member.organizationId, id),
          eq(schema.member.role, "owner"),
          ne(schema.member.id, body.data.memberId)
        )
      )
      .limit(1);
    if (others.length === 0) {
      return apiError(422, "last_admin", "La empresa no puede quedarse sin admin");
    }
  }

  await db
    .update(schema.member)
    .set({ role: body.data.role })
    .where(eq(schema.member.id, body.data.memberId));
  return Response.json({ ok: true });
});
