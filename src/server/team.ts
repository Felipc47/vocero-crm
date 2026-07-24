import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** ¿La organización tiene entre sus miembros a un superadmin? (La empresa
 * del superadmin no tiene tope de equipo; el resto, TEAM_LIMIT.) */
export async function hasUnlimitedTeam(
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.user.isSuperadmin, true)
      )
    )
    .limit(1);
  return rows.length > 0;
}
