import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { isOrgAdmin, TEAM_LIMIT } from "@/lib/permissions";
import { hasUnlimitedTeam } from "@/server/team";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));
  const unlimited = await hasUnlimitedTeam(session.organizationId);
  return Response.json({
    limit: unlimited ? null : TEAM_LIMIT,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: z.enum(["owner", "agent_editor", "commercial", "marketing"]).default("commercial"),
});

/** Alta de cuenta de equipo (admin only): email + contraseña temporal
 * (FR-061), con rol asignado y tope de 6 usuarios por empresa. */
export const POST = withAuth(async (session, req: Request) => {
  if (!isOrgAdmin(session.role)) {
    return apiError(403, "forbidden", "Solo el admin puede crear cuentas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  if (!(await hasUnlimitedTeam(session.organizationId))) {
    const [current] = await db
      .select({ n: count() })
      .from(schema.member)
      .where(eq(schema.member.organizationId, session.organizationId));
    if ((current?.n ?? 0) >= TEAM_LIMIT) {
      return apiError(
        422,
        "team_limit",
        `El equipo está completo: máximo ${TEAM_LIMIT} usuarios (incluido el admin)`
      );
    }
  }

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  await db
    .insert(schema.member)
    .values({
      id: newId("organization"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: body.data.role,
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});
