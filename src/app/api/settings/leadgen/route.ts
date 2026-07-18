import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import {
  getLeadgenSettings,
  saveLeadgenSettings,
} from "@/server/org-settings";

export const dynamic = "force-dynamic";

/** Setting del saludo automático a leads de Meta (004, spec B). */
export const GET = withAuth(async (session) => {
  const settings = await getLeadgenSettings(session.organizationId);
  return Response.json({ settings });
});

const putSchema = z.object({
  greetingTemplateId: z.string().trim().min(1).nullable(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  await saveLeadgenSettings(session.organizationId, body.data);
  return Response.json({ ok: true });
});
