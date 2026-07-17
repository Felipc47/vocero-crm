import { apiError, withAuth } from "@/lib/api";
import { publish } from "@/server/events/bus";
import {
  getConversation,
  resetConversation,
  serializeConversation,
} from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Reinicia la conversación: borra su historial y limpia su estado (FR-nueva). */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const reset = await resetConversation(session.organizationId, id);
  if (!reset) return apiError(404, "not_found", "Conversación no encontrada");

  const row = await getConversation(session.organizationId, id);
  if (row) {
    const dto = serializeConversation(row.conversation, row.contact);
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: dto },
    });
    return Response.json({ conversation: dto });
  }
  return Response.json({ conversation: null });
});
