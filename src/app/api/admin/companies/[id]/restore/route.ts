import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Restaura una empresa eliminada mientras su respaldo de 30 días siga vivo:
 * el acceso de sus usuarios y su webhook vuelven tal cual estaban. */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const { id } = await ctx.params;

  const db = getDb();
  const rows = await db
    .select({ deletedAt: schema.organization.deletedAt })
    .from(schema.organization)
    .where(eq(schema.organization.id, id))
    .limit(1);
  const org = rows[0];
  if (!org) return apiError(404, "not_found", "Empresa no encontrada");
  if (!org.deletedAt) {
    return apiError(409, "not_deleted", "La empresa no está eliminada");
  }

  await db
    .update(schema.organization)
    .set({ deletedAt: null })
    .where(eq(schema.organization.id, id));
  return Response.json({ ok: true });
});
