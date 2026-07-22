import { apiError, withAuth } from "@/lib/api";
import {
  campaignErrorStatus,
  CampaignError,
  countByStatus,
  retryFailed,
} from "@/server/campaigns/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Devuelve los fallidos a la cola y reanuda el despacho. */
export const POST = withAuth(async (session, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  try {
    const retried = await retryFailed(session.organizationId, id);
    return Response.json({
      ok: true,
      retried,
      progress: await countByStatus(session.organizationId, id),
    });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
