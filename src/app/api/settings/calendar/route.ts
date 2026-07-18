import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { isGoogleConfigured } from "@/lib/env";
import {
  getCalendarSettings,
  saveCalendarSettings,
} from "@/server/org-settings";
import {
  deleteGoogleConnection,
  getGoogleConnection,
} from "@/server/google/credentials";

export const dynamic = "force-dynamic";

/** Estado de la conexión + settings de agendamiento (Ajustes → Calendario). */
export const GET = withAuth(async (session) => {
  const [connection, settings] = await Promise.all([
    getGoogleConnection(session.organizationId),
    getCalendarSettings(session.organizationId),
  ]);
  return Response.json({
    googleConfigured: isGoogleConfigured(),
    connection: connection
      ? { accountEmail: connection.accountEmail, status: connection.status }
      : null,
    settings,
  });
});

const putSchema = z.object({
  internalInvitees: z.array(z.string().trim().email()).max(10),
  defaultTitle: z.string().trim().min(1).max(120),
  defaultDurationMin: z.number().int().min(15).max(240),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  await saveCalendarSettings(session.organizationId, body.data);
  return Response.json({ ok: true });
});

/** Desconecta la cuenta de Google (borra el refresh token cifrado). */
export const DELETE = withAuth(async (session) => {
  await deleteGoogleConnection(session.organizationId);
  return Response.json({ ok: true });
});
