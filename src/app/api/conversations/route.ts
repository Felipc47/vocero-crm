import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getContactById } from "@/server/contacts";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { listConversations } from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({ conversations });
});

const createSchema = z.object({ contactId: z.string().min(1) });

/**
 * Abre (o recupera) la conversación de un contacto sin mensajes todavía —
 * p. ej. un prospecto importado por CSV o creado a mano. La ventana de 24h
 * nace cerrada, así que el primer mensaje será una plantilla aprobada.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const contact = await getContactById(
    session.organizationId,
    body.data.contactId
  );
  if (!contact) {
    return apiError(404, "not_found", "Contacto no encontrado");
  }
  const conversation = await getOrCreateConversation(
    session.organizationId,
    contact.id
  );
  return Response.json({ conversation: { id: conversation.id } });
});
