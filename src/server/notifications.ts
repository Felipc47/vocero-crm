import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function serialize(n: typeof schema.notification.$inferSelect): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.href,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Crea la notificación y la empuja por SSE a la organización del
 * destinatario (su bandeja de eventos, no la del recurso). */
export async function notifyUser(input: {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
}): Promise<void> {
  const db = getDb();
  const inserted = await db
    .insert(schema.notification)
    .values({
      id: newId("notification"),
      userId: input.userId,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    })
    .returning();
  const row = inserted[0]!;

  const membership = await db
    .select({ orgId: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, input.userId))
    .limit(1);
  if (membership[0]) {
    publish(membership[0].orgId, {
      type: "notification.new",
      data: { notification: serialize(row) },
    });
  }
}

/**
 * Notifica a quienes pueden aprobar sobre recursos de `organizationId`: los
 * admins (owner) de esa empresa y todos los superadmins de la instancia.
 */
export async function notifyOrgApprovers(
  organizationId: string,
  input: {
    type: string;
    title: string;
    body?: string | null;
    href?: string | null;
    excludeUserId?: string;
  }
): Promise<void> {
  const db = getDb();
  const owners = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.role, "owner")
      )
    );
  const supers = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.isSuperadmin, true));

  const recipients = new Set([
    ...owners.map((o) => o.userId),
    ...supers.map((s) => s.userId),
  ]);
  if (input.excludeUserId) recipients.delete(input.excludeUserId);

  for (const userId of recipients) {
    await notifyUser({
      userId,
      organizationId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    });
  }
}

export async function listNotifications(userId: string): Promise<{
  notifications: NotificationDto[];
  unread: number;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.notification)
    .where(eq(schema.notification.userId, userId))
    .orderBy(desc(schema.notification.createdAt))
    .limit(30);
  const unreadRows = await db
    .select({ id: schema.notification.id })
    .from(schema.notification)
    .where(
      and(
        eq(schema.notification.userId, userId),
        isNull(schema.notification.readAt)
      )
    );
  return { notifications: rows.map(serialize), unread: unreadRows.length };
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notification.userId, userId),
        isNull(schema.notification.readAt)
      )
    );
}
