import { and, eq, isNotNull, lt, notInArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** Días que se conserva el respaldo de una empresa eliminada. */
export const RETENTION_DAYS = 30;

export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RETENTION_DAYS * 86400000);
}

/**
 * Purga definitiva de empresas cuyo respaldo venció. Se invoca de forma
 * perezosa desde las rutas de administración (sin colas externas, por
 * constitución): es idempotente y barata cuando no hay nada que purgar.
 *
 * El borrado de la organización cascadea a TODO su dominio (contactos,
 * conversaciones, mensajes, campañas…). Después se limpian los usuarios que
 * quedaron sin ninguna membresía (nunca el superadmin).
 */
export async function purgeExpiredCompanies(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
  const expired = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(
      and(
        isNotNull(schema.organization.deletedAt),
        lt(schema.organization.deletedAt, cutoff)
      )
    );
  if (expired.length === 0) return 0;

  for (const org of expired) {
    await db
      .delete(schema.organization)
      .where(eq(schema.organization.id, org.id));
  }

  // Usuarios huérfanos: sin membresía restante y sin rol de superadmin.
  const remaining = db
    .select({ userId: schema.member.userId })
    .from(schema.member);
  await db
    .delete(schema.user)
    .where(
      and(
        notInArray(schema.user.id, remaining),
        eq(schema.user.isSuperadmin, false)
      )
    );
  return expired.length;
}
