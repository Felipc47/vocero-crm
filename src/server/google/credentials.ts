import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

/**
 * Conexión de Google Calendar por organización (004). Refresh token cifrado
 * en reposo — espejo del patrón de meta_credentials.
 */

export type GoogleConnection = {
  id: string;
  organizationId: string;
  accountEmail: string;
  status: "connected" | "reconnect_required";
  refreshToken: string;
};

type Row = typeof schema.googleCredentials.$inferSelect;

function toConnection(row: Row): GoogleConnection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    accountEmail: row.accountEmail,
    status: row.status,
    refreshToken: decryptSecret({
      cipher: row.refreshCipher,
      iv: row.refreshIv,
      tag: row.refreshTag,
    }),
  };
}

export async function getGoogleConnection(
  organizationId: string
): Promise<GoogleConnection | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.googleCredentials)
    .where(scoped(schema.googleCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toConnection(rows[0]) : null;
}

export async function saveGoogleConnection(input: {
  organizationId: string;
  accountEmail: string;
  refreshToken: string;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.refreshToken);
  await db
    .insert(schema.googleCredentials)
    .values({
      id: newId("googleCredentials"),
      organizationId: input.organizationId,
      accountEmail: input.accountEmail,
      refreshCipher: enc.cipher,
      refreshIv: enc.iv,
      refreshTag: enc.tag,
      status: "connected",
    })
    .onConflictDoUpdate({
      target: [schema.googleCredentials.organizationId],
      set: {
        accountEmail: input.accountEmail,
        refreshCipher: enc.cipher,
        refreshIv: enc.iv,
        refreshTag: enc.tag,
        status: "connected",
        updatedAt: new Date(),
      },
    });
}

export async function deleteGoogleConnection(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.googleCredentials)
    .where(scoped(schema.googleCredentials.organizationId, organizationId));
}

/** Marca la conexión como vencida (refresh token revocado en runtime). */
export async function markGoogleReconnectRequired(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.googleCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(scoped(schema.googleCredentials.organizationId, organizationId));
}
