import { withAuth } from "@/lib/api";
import {
  listNotifications,
  markAllNotificationsRead,
} from "@/server/notifications";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const data = await listNotifications(session.userId);
  return Response.json(data);
});

/** Marca todas como leídas (al abrir la campana). */
export const PATCH = withAuth(async (session) => {
  await markAllNotificationsRead(session.userId);
  return Response.json({ ok: true });
});
