import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { audienceFilterSchema } from "@/server/campaigns/audience";
import {
  campaignErrorStatus,
  CampaignError,
  countByStatus,
  createCampaign,
  ensureDispatching,
} from "@/server/campaigns/runner";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      campaign: schema.campaign,
      templateName: schema.template.name,
    })
    .from(schema.campaign)
    .innerJoin(schema.template, eq(schema.template.id, schema.campaign.templateId))
    .where(scoped(schema.campaign.organizationId, session.organizationId))
    .orderBy(desc(schema.campaign.createdAt));

  const campaigns = await Promise.all(
    rows.map(async (row) => {
      // Auto-sanado: si quedó `running` sin bucle vivo (reinicio), reanudar.
      ensureDispatching(
        session.organizationId,
        row.campaign.id,
        row.campaign.status
      );
      const progress = await countByStatus(
        session.organizationId,
        row.campaign.id
      );
      return {
        id: row.campaign.id,
        name: row.campaign.name,
        status: row.campaign.status,
        templateName: row.templateName,
        variableMode: row.campaign.variableMode,
        error: row.campaign.error,
        createdAt: row.campaign.createdAt.toISOString(),
        progress,
      };
    })
  );

  return Response.json({ campaigns });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  templateId: z.string().trim().min(1),
  variableMode: z.enum(["none", "contact_name", "fixed"]).optional(),
  variableValue: z.string().trim().max(200).optional(),
  audience: audienceFilterSchema,
  /** Confirmación explícita del operador para incluir contactos sin
   * consentimiento registrado en una campaña de MARKETING (006). */
  includeWithoutConsent: z.boolean().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  try {
    const campaignId = await createCampaign(session.organizationId, {
      ...body.data,
      variableMode: body.data.variableMode ?? "none",
    });
    const progress = await countByStatus(session.organizationId, campaignId);
    return Response.json({ campaign: { id: campaignId, progress } }, { status: 201 });
  } catch (err) {
    if (err instanceof CampaignError) {
      return apiError(campaignErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
