import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { audienceFilterSchema, resolveAudience } from "@/server/campaigns/audience";

export const dynamic = "force-dynamic";

const previewSchema = z.object({ audience: audienceFilterSchema });

/** Cuántos contactos recibiría la campaña, antes de crearla. */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, previewSchema);
  if (!body.ok) return body.response;

  const contacts = await resolveAudience(session.organizationId, body.data.audience);
  return Response.json({
    total: contacts.length,
    sample: contacts.slice(0, 5).map((c) => c.name),
  });
});
