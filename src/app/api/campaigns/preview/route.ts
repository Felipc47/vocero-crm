import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  audienceFilterSchema,
  hasMarketingConsent,
  resolveAudience,
} from "@/server/campaigns/audience";
import { getMessagingLimit } from "@/server/whatsapp/messaging-limit";

export const dynamic = "force-dynamic";

const previewSchema = z.object({
  audience: audienceFilterSchema,
  /** Para calcular la exclusión por consentimiento según su categoría. */
  templateId: z.string().trim().min(1).optional(),
});

/**
 * Alcance de la campaña ANTES de crearla: cuántos entran, cuántos quedan
 * fuera por falta de consentimiento (solo MARKETING) y si la audiencia
 * excede el límite de conversaciones nuevas por 24 h del número.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, previewSchema);
  if (!body.ok) return body.response;

  const contacts = await resolveAudience(
    session.organizationId,
    body.data.audience
  );

  let isMarketing = false;
  if (body.data.templateId) {
    const rows = await getDb()
      .select({ category: schema.template.category })
      .from(schema.template)
      .where(
        scoped(
          schema.template.organizationId,
          session.organizationId,
          eq(schema.template.id, body.data.templateId)
        )
      )
      .limit(1);
    isMarketing = (rows[0]?.category ?? "").toUpperCase() === "MARKETING";
  }

  const withoutConsent = isMarketing
    ? contacts.filter((c) => !hasMarketingConsent(c)).length
    : 0;
  const eligible = contacts.length - withoutConsent;

  const limit = await getMessagingLimit(session.organizationId);
  const exceedsCap =
    limit.cap !== null && Number.isFinite(limit.cap) && eligible > limit.cap;

  return Response.json({
    total: contacts.length,
    eligible,
    withoutConsent,
    isMarketing,
    messagingLimit: {
      tier: limit.tier,
      cap: limit.cap === null || !Number.isFinite(limit.cap) ? null : limit.cap,
      exceeds: exceedsCap,
      overflow: exceedsCap ? eligible - (limit.cap as number) : 0,
    },
    sample: contacts.slice(0, 5).map((c) => c.name),
  });
});
