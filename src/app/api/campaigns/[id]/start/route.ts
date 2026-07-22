import { apiError, withAuth } from "@/lib/api";
import {
  campaignErrorStatus,
  CampaignError,
  countByStatus,
  startCampaign,
} from "@/server/campaigns/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Inicia (o reanuda) el despacho; responde de inmediato — progreso por SSE. */
export const POST = withAuth(async (session, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  try {
    await startCampaign(session.organizationId, id);
    return Response.json({
      ok: true,
      progress: await countByStatus(session.organizationId, id),
    });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
