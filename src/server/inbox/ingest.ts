import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import type { WebhookValue } from "@/server/inbox/webhook";
import { applyStatusUpdate } from "@/server/inbox/status";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { detectOptOut } from "@/server/inbox/opt-out";
import { transcribeInboundAudio } from "@/server/ai/media";
import { translateStoredError } from "@/server/whatsapp/delivery-errors";
import { maybeRunAgentTurn } from "@/server/ai/trigger";

/** Tipos de contenido soportados; el resto se ignora sin error. */
const SUPPORTED_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

export async function getOrCreateContact(
  organizationId: string,
  phone: string,
  name?: string | null,
  /** Origen del consentimiento cuando el contacto se crea aquí (006). Por
   * defecto `inbound_message`: llegó porque ESCRIBIÓ al negocio. */
  consentSource: "meta_lead_ads" | "inbound_message" = "inbound_message"
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      phone,
      name: name?.trim() || phone,
      consentSource,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (inserted[0]) return { contact: inserted[0], isNew: true };

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.phone, phone)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("contacto no encontrado tras upsert");

  // Reactivar si estaba archivado (el nombre editado por el operador se respeta).
  if (existing.archivedAt) {
    await db
      .update(schema.contact)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(schema.contact.id, existing.id));
    existing.archivedAt = null;
  }
  return { contact: existing, isNew: false };
}

export async function getOrCreateConversation(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.conversation)
    .values({ id: newId("conversation"), organizationId, contactId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("conversación no encontrada tras upsert");
  return existing;
}

/**
 * Procesa el `value` de un cambio `messages` del webhook: mensajes entrantes
 * (idempotentes por wa_message_id) y actualizaciones de estado.
 */
export async function processMessagesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    // Caso típico: webhook/override configurado ANTES de guardar la conexión
    // en el wizard — el evento llega pero no hay a qué organización enrutarlo.
    console.warn(
      `[webhook] evento para phone_number_id desconocido (${phoneNumberId}): ` +
        "guarda la conexión en Configuración → WhatsApp para recibir mensajes"
    );
    return;
  }

  const organizationId = credentials.organizationId;

  for (const status of value.statuses ?? []) {
    await applyStatusUpdate(organizationId, status);
  }

  for (const msg of value.messages ?? []) {
    if (!SUPPORTED_TYPES.has(msg.type)) continue; // reacciones, etc.: ignorar
    const profileName = value.contacts?.find(
      (c) => c.wa_id === msg.from
    )?.profile?.name;
    // Adjuntos (007): el shape es el mismo para todos los tipos de media.
    const media =
      msg.image ?? msg.audio ?? msg.video ?? msg.document ?? msg.sticker;
    await ingestInboundMessage({
      organizationId,
      from: msg.from,
      profileName: profileName ?? null,
      waMessageId: msg.id,
      type: msg.type,
      // El pie de foto es el texto del mensaje; el audio llega sin texto y su
      // transcripción se rellena más abajo.
      text: msg.text?.body ?? media?.caption ?? null,
      mediaId: media?.id ?? null,
      mediaMime: media?.mime_type ?? null,
      timestamp: msg.timestamp,
    });
  }
}

export async function ingestInboundMessage(input: {
  organizationId: string;
  from: string;
  profileName: string | null;
  waMessageId: string;
  type: string;
  text: string | null;
  mediaId?: string | null;
  mediaMime?: string | null;
  timestamp: string;
}): Promise<void> {
  const db = getDb();
  const { organizationId } = input;

  const { contact } = await getOrCreateContact(
    organizationId,
    input.from,
    input.profileName
  );
  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id
  );

  const waTimestamp = toDate(input.timestamp);

  // Idempotencia dura: mismo wa_message_id → sin efectos adicionales.
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: input.waMessageId,
      direction: "in",
      type: input.type,
      text: input.text,
      mediaId: input.mediaId ?? null,
      mediaMime: input.mediaMime ?? null,
      status: "delivered",
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  let message = inserted[0];
  if (!message) return; // duplicado

  // Notas de voz (007): se transcriben ANTES de seguir, para que la bandeja,
  // la detección de bajas y el turno del agente vean el contenido real. Si no
  // hay transcripción configurada o el proveedor falla, se sigue igual.
  if (input.type === "audio" && input.mediaId) {
    const transcript = await transcribeInboundAudio({
      organizationId,
      mediaId: input.mediaId,
      mime: input.mediaMime ?? null,
    });
    if (transcript) {
      const updated = await db
        .update(schema.message)
        .set({ text: transcript })
        .where(eq(schema.message.id, message.id))
        .returning();
      message = updated[0] ?? message;
    }
  }

  await db
    .update(schema.conversation)
    .set({
      lastInboundAt: waTimestamp,
      lastMessageAt: waTimestamp,
      unreadCount: sql`${schema.conversation.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.conversation.id, conversation.id));

  await onLeadActivity(organizationId, contact.id, waTimestamp);

  // Política de Meta (006): si el contacto pide la baja, se respeta al vuelo.
  // Vale también por nota de voz, usando su transcripción (007).
  if ((input.type === "text" || input.type === "audio") && !contact.optedOutAt) {
    const reason = detectOptOut(message.text);
    if (reason) {
      await db
        .update(schema.contact)
        .set({
          optedOutAt: waTimestamp,
          optedOutReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.contact.id, contact.id));
    }
  }

  publish(organizationId, {
    type: "message.new",
    data: { conversationId: conversation.id, message: serializeMessage(message) },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  await maybeRunAgentTurn(conversation.id);
}

function toDate(timestamp: string): Date {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

export function serializeMessage(m: typeof schema.message.$inferSelect) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    type: m.type,
    text: m.text,
    status: m.status,
    error: m.error ? translateStoredError(m.error) : null,
    aiGenerated: m.aiGenerated,
    createdAt: (m.waTimestamp ?? m.createdAt).toISOString(),
  };
}
