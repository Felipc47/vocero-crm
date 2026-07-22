import { apiError, withAuth } from "@/lib/api";
import {
  campaignErrorStatus,
  CampaignError,
  countByStatus,
  pauseCampaign,
} from "@/server/campaigns/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  try {
    await pauseCampaign(session.organizationId, id);
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
