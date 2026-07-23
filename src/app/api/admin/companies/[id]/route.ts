import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { purgeDate, purgeExpiredCompanies } from "@/server/admin/companies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Elimina una empresa (borrado suave): sus usuarios pierden el acceso y su
 * webhook deja de procesar de inmediato, pero los datos quedan de respaldo
 * 30 días (restaurables) antes de la purga definitiva. La doble confirmación
 * ocurre en la UI (escribir el nombre exacto de la empresa).
 */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!session.isSuperadmin) {
    return apiError(403, "forbidden", "Solo el superadmin administra empresas");
  }
  const { id } = await ctx.params;
  if (id === session.organizationId) {
    return apiError(
      403,
      "own_organization",
      "No puedes eliminar tu propia organización"
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.organization.id,
      deletedAt: schema.organization.deletedAt,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, id))
    .limit(1);
  const org = rows[0];
  if (!org) return apiError(404, "not_found", "Empresa no encontrada");
  if (org.deletedAt) {
    return apiError(409, "already_deleted", "La empresa ya está eliminada");
  }

  const deletedAt = new Date();
  await db
    .update(schema.organization)
    .set({ deletedAt })
    .where(eq(schema.organization.id, id));

  void purgeExpiredCompanies().catch(() => {});
  return Response.json({
    ok: true,
    deletedAt: deletedAt.toISOString(),
    purgeAt: purgeDate(deletedAt).toISOString(),
  });
});
