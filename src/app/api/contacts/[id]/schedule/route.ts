import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ScheduleError, scheduleMeeting } from "@/server/google/scheduling";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  prospectEmail: z.string().trim().email().max(254),
  startIso: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(240).optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

const ERROR_STATUS: Record<ScheduleError["code"], number> = {
  not_connected: 409,
  reconnect_required: 409,
  contact_not_found: 404,
  slot_taken: 409,
  google_error: 502,
};

/** Agendar reunión manual desde el slide-over del lead (004). */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const event = await scheduleMeeting({
      organizationId: session.organizationId,
      contactId: id,
      prospectEmail: body.data.prospectEmail,
      startIso: body.data.startIso,
      durationMin: body.data.durationMin,
      title: body.data.title,
    });
    return Response.json({ event });
  } catch (err) {
    if (err instanceof ScheduleError) {
      return apiError(ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
