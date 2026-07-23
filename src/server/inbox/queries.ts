import { and, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string };
  stageName: string | null;
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
  pinnedAt: string | null;
  archivedAt: string | null;
};

/** Máximo de conversaciones ancladas simultáneas por organización. */
export const MAX_PINNED = 3;

export async function listConversations(
  organizationId: string,
  since?: Date
): Promise<ConversationDto[]> {
  const db = getDb();
  const previewSql = sql<string | null>`(
    select coalesce(m.text, m.type)
    from message m
    where m.conversation_id = ${schema.conversation.id}
    order by m.created_at desc
    limit 1
  )`;
  const stageSql = sql<string | null>`(
    select s.name from lead l
    join pipeline_stage s on s.id = l.stage_id
    where l.contact_id = ${schema.contact.id}
    limit 1
  )`;

  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
      preview: previewSql,
      stageName: stageSql,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false),
        since ? gt(schema.conversation.updatedAt, since) : undefined
      )
    )
    .orderBy(desc(sql`coalesce(${schema.conversation.lastMessageAt}, ${schema.conversation.createdAt})`));

  return rows.map((r) =>
    serializeConversation(r.conversation, r.contact, r.preview, r.stageName)
  );
}

export async function getConversation(
  organizationId: string,
  conversationId: string
) {
  const db = getDb();
  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMessages(
  organizationId: string,
  conversationId: string,
  since?: Date
) {
  const db = getDb();
  return db
    .select()
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId),
        since ? gt(schema.message.createdAt, since) : undefined
      )
    )
    .orderBy(schema.message.createdAt);
}

export function serializeConversation(
  c: typeof schema.conversation.$inferSelect,
  contact: typeof schema.contact.$inferSelect,
  preview: string | null = null,
  stageName: string | null = null
): ConversationDto {
  return {
    id: c.id,
    contact: { id: contact.id, name: contact.name, phone: contact.phone },
    stageName,
    aiEnabled: c.aiEnabled,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    handoffReason: c.handoffReason,
    lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    windowOpen: isWindowOpen(c.lastInboundAt),
    windowRemainingMs: windowRemainingMs(c.lastInboundAt),
    preview,
    pinnedAt: c.pinnedAt?.toISOString() ?? null,
    archivedAt: c.archivedAt?.toISOString() ?? null,
  };
}

export async function updateConversation(
  organizationId: string,
  conversationId: string,
  patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
    markRead?: boolean;
    pinned?: boolean;
    archived?: boolean;
  }
): Promise<
  | { ok: true; row: typeof schema.conversation.$inferSelect }
  | { ok: false; error: "not_found" | "pin_limit" }
> {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.aiEnabled !== undefined) set.aiEnabled = patch.aiEnabled;
  if (patch.reactivate) {
    set.handoffAt = null;
    set.handoffReason = null;
    set.aiEnabled = patch.aiEnabled ?? true;
  }
  if (patch.markRead) set.unreadCount = 0;
  if (patch.pinned === true) {
    // Existencia primero: un id ajeno/inexistente debe ser 404, no pin_limit.
    const target = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          eq(schema.conversation.id, conversationId)
        )
      )
      .limit(1);
    if (!target[0]) return { ok: false, error: "not_found" };
    const pinned = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          organizationId,
          eq(schema.conversation.isTest, false),
          isNotNull(schema.conversation.pinnedAt),
          ne(schema.conversation.id, conversationId)
        )
      );
    if (pinned.length >= MAX_PINNED) return { ok: false, error: "pin_limit" };
    set.pinnedAt = new Date();
    // Anclar una conversación archivada la devuelve a la bandeja principal.
    set.archivedAt = null;
  }
  if (patch.pinned === false) set.pinnedAt = null;
  if (patch.archived === true) {
    set.archivedAt = new Date();
    // Archivar desancla: las ancladas viven solo en la bandeja principal.
    set.pinnedAt = null;
  }
  if (patch.archived === false) set.archivedAt = null;

  const updated = await db
    .update(schema.conversation)
    .set(set)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning();
  const row = updated[0];
  return row ? { ok: true, row } : { ok: false, error: "not_found" };
}

/**
 * Reinicia una conversación: borra todo su historial de mensajes y limpia el
 * estado (ventana, no leídos, handoff), dejándola vacía. El contacto y la
 * conversación se conservan; el agente arrancará sin contexto viejo cuando el
 * contacto vuelva a escribir. Devuelve la conversación o null si no existe.
 */
export async function resetConversation(
  organizationId: string,
  conversationId: string
) {
  const db = getDb();
  const existing = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  if (!existing[0]) return null;

  await db
    .delete(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId)
      )
    );

  const updated = await db
    .update(schema.conversation)
    .set({
      lastInboundAt: null,
      lastMessageAt: null,
      unreadCount: 0,
      handoffAt: null,
      handoffReason: null,
      aiEnabled: true,
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning();
  return updated[0] ?? null;
}
