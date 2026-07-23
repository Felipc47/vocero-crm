import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  graphRequest,
  graphUpload,
  MetaApiError,
  normalizeRecipient,
} from "@/lib/meta/client";
import { classifyWaMedia, formatBytes } from "@/lib/wa-media";
import { publish } from "@/server/events/bus";
import {
  getCredentialsByOrg,
  markReconnectRequired,
  type Credentials,
} from "@/server/whatsapp/credentials";
import { isWindowOpen } from "@/server/inbox/window";
import { serializeMessage } from "@/server/inbox/ingest";

/** Error tipado del envío; `code` mapea a HTTP en la capa de API. */
export class SendError extends Error {
  code:
    | "sandbox_violation"
    | "not_connected"
    | "reconnect_required"
    | "window_closed"
    | "unsupported_media"
    | "too_large"
    | "meta_error"
    | "meta_unavailable";

  /** Código numérico de Meta cuando lo hay: distingue un fallo del
   * destinatario de uno que afecta a TODOS los envíos (006). */
  metaCode: number | null;

  constructor(
    code: SendError["code"],
    message: string,
    metaCode?: number | null
  ) {
    super(message);
    this.name = "SendError";
    this.code = code;
    this.metaCode = metaCode ?? null;
  }
}

type SendResult = { messageId: string };

/** Mapa código → HTTP para las rutas de API que envían mensajes. */
export const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 403,
  not_connected: 409,
  reconnect_required: 409,
  window_closed: 409,
  unsupported_media: 422,
  too_large: 413,
  meta_error: 422,
  meta_unavailable: 503,
};

/**
 * Envía un mensaje de texto libre por WhatsApp.
 *
 * ASERCIÓN DURA (FR-031): una conversación de prueba del Laboratorio jamás
 * llega a la API real — se lanza ANTES de tocar credenciales o red.
 */
export async function sendText(input: {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated?: boolean;
}): Promise<SendResult> {
  const { contact, credentials } = await resolveOutboundTarget(
    input.conversationId,
    input.organizationId
  );

  const waMessageId = await callGraphSend(credentials, {
    messaging_product: "whatsapp",
    to: normalizeRecipient(contact.phone),
    type: "text",
    text: { body: input.text },
  });

  return persistOutbound({
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    waMessageId,
    type: "text",
    text: input.text,
    aiGenerated: input.aiGenerated ?? false,
  });
}

/**
 * Envía un adjunto (imagen, video, audio o documento de los formatos que
 * WhatsApp acepta): sube el binario a Meta y manda el mensaje con el media_id
 * resultante — que además queda guardado para servirlo bajo demanda en el
 * hilo. Mismos guards que el texto libre (sandbox, ventana, credenciales).
 */
export async function sendMedia(input: {
  conversationId: string;
  organizationId: string;
  bytes: Uint8Array;
  mime: string;
  filename: string;
  caption?: string | null;
}): Promise<SendResult> {
  const spec = classifyWaMedia(input.mime);
  if (!spec) {
    throw new SendError(
      "unsupported_media",
      "WhatsApp no acepta este formato de archivo"
    );
  }
  if (input.bytes.byteLength > spec.maxBytes) {
    throw new SendError(
      "too_large",
      `El archivo supera el máximo permitido (${formatBytes(spec.maxBytes)})`
    );
  }

  const { contact, credentials } = await resolveOutboundTarget(
    input.conversationId,
    input.organizationId
  );

  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", input.mime);
  form.set(
    "file",
    new Blob([input.bytes as BlobPart], { type: input.mime }),
    input.filename
  );
  let uploadedId: string;
  try {
    const uploaded = await graphUpload<{ id?: string }>(
      `${credentials.phoneNumberId}/media`,
      { token: credentials.token, form }
    );
    if (!uploaded.id) {
      throw new SendError("meta_error", "Meta no devolvió ID del adjunto");
    }
    uploadedId = uploaded.id;
  } catch (err) {
    throw await translateMetaError(err, credentials);
  }

  const caption = input.caption?.trim() || undefined;
  const payload =
    spec.kind === "document"
      ? { document: { id: uploadedId, filename: input.filename, ...(caption ? { caption } : {}) } }
      : spec.kind === "audio"
        ? { audio: { id: uploadedId } }
        : { [spec.kind]: { id: uploadedId, ...(caption ? { caption } : {}) } };

  const waMessageId = await callGraphSend(credentials, {
    messaging_product: "whatsapp",
    to: normalizeRecipient(contact.phone),
    type: spec.kind,
    ...payload,
  });

  return persistOutbound({
    conversationId: input.conversationId,
    organizationId: input.organizationId,
    waMessageId,
    type: spec.kind,
    text: caption ?? null,
    mediaId: uploadedId,
    mediaMime: input.mime,
    mediaFilename: spec.kind === "document" ? input.filename : null,
    aiGenerated: false,
  });
}

/** Guards comunes a todo envío saliente (FR-031: el Laboratorio jamás toca la
 * API real; la ventana de 24 h solo admite plantillas al cerrarse). */
async function resolveOutboundTarget(
  conversationId: string,
  organizationId: string
): Promise<{
  contact: typeof schema.contact.$inferSelect;
  credentials: Credentials;
}> {
  const db = getDb();
  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const row = rows[0];
  if (!row || row.conversation.organizationId !== organizationId) {
    throw new SendError("meta_error", "Conversación no encontrada");
  }

  if (row.conversation.isTest) {
    throw new SendError(
      "sandbox_violation",
      "Conversación de prueba del Laboratorio: el envío real está prohibido"
    );
  }

  if (!isWindowOpen(row.conversation.lastInboundAt)) {
    throw new SendError(
      "window_closed",
      "La ventana de 24 horas está cerrada; usa una plantilla aprobada"
    );
  }

  const credentials = await getCredentialsByOrg(organizationId);
  if (!credentials) {
    throw new SendError("not_connected", "No hay número de WhatsApp conectado");
  }
  if (credentials.status === "reconnect_required") {
    throw new SendError(
      "reconnect_required",
      "El token de WhatsApp expiró: reconecta el número en Configuración"
    );
  }
  return { contact: row.contact, credentials };
}

async function persistOutbound(input: {
  conversationId: string;
  organizationId: string;
  waMessageId: string;
  type: string;
  text: string | null;
  mediaId?: string | null;
  mediaMime?: string | null;
  mediaFilename?: string | null;
  aiGenerated: boolean;
}): Promise<SendResult> {
  const db = getDb();
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId: input.waMessageId,
      direction: "out",
      type: input.type,
      text: input.text,
      mediaId: input.mediaId ?? null,
      mediaMime: input.mediaMime ?? null,
      mediaFilename: input.mediaFilename ?? null,
      status: "pending",
      aiGenerated: input.aiGenerated,
    })
    .returning();
  const message = inserted[0]!;

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  publish(input.organizationId, {
    type: "message.new",
    data: {
      conversationId: input.conversationId,
      message: serializeMessage(message),
    },
  });

  return { messageId: message.id };
}

/** Llama a Graph /messages y traduce errores de Meta a SendError. */
export async function callGraphSend(
  credentials: Credentials,
  payload: unknown
): Promise<string> {
  try {
    const res = await graphRequest<{ messages?: { id: string }[] }>(
      `${credentials.phoneNumberId}/messages`,
      { method: "POST", token: credentials.token, body: payload }
    );
    const id = res.messages?.[0]?.id;
    if (!id) throw new SendError("meta_error", "Meta no devolvió ID de mensaje");
    return id;
  } catch (err) {
    throw await translateMetaError(err, credentials);
  }
}

/** Traduce un fallo de la Graph API a SendError (y marca la reconexión si el
 * token murió). Errores ajenos a Meta se re-lanzan tal cual. */
async function translateMetaError(
  err: unknown,
  credentials: Credentials
): Promise<Error> {
  if (err instanceof SendError) return err;
  if (err instanceof MetaApiError) {
    if (err.isAuthError) {
      await markReconnectRequired(credentials.organizationId);
      return new SendError(
        "reconnect_required",
        "El token de WhatsApp expiró: reconecta el número en Configuración"
      );
    }
    if (err.status === 0 || err.status >= 500) {
      return new SendError(
        "meta_unavailable",
        "Meta no está disponible ahora",
        err.code
      );
    }
    return new SendError("meta_error", err.message, err.code);
  }
  return err instanceof Error ? err : new Error(String(err));
}
