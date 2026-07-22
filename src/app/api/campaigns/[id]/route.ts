import { asc, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  campaignErrorStatus,
  CampaignError,
  countByStatus,
  ensureDispatching,
  loadCampaign,
} from "@/server/campaigns/runner";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Detalle de la campaña con el estado de cada destinatario. */
export const GET = withAuth(async (session, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  try {
    const campaign = await loadCampaign(session.organizationId, id);
    ensureDispatching(session.organizationId, campaign.id, campaign.status);

    const recipients = await getDb()
      .select({
        id: schema.campaignRecipient.id,
        status: schema.campaignRecipient.status,
        error: schema.campaignRecipient.error,
        contactName: schema.contact.name,
        contactPhone: schema.contact.phone,
      })
      .from(schema.campaignRecipient)
      .innerJoin(
        schema.contact,
        eq(schema.contact.id, schema.campaignRecipient.contactId)
      )
      .where(
        scoped(
          schema.campaignRecipient.organizationId,
          session.organizationId,
          eq(schema.campaignRecipient.campaignId, id)
        )
      )
      .orderBy(asc(schema.campaignRecipient.createdAt));

    return Response.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        variableMode: campaign.variableMode,
        variableValue: campaign.variableValue,
        error: campaign.error,
        createdAt: campaign.createdAt.toISOString(),
        progress: await countByStatus(session.organizationId, id),
      },
      recipients,
    });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
