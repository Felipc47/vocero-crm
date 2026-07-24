import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { canApproveTemplates } from "@/lib/permissions";
import { notifyUser } from "@/server/notifications";
import {
  rejectTemplateInternally,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** Rechaza una plantilla pendiente de aprobación: vuelve a borrador local
 * (nunca llegó a Meta) y se le avisa a quien la propuso. */
export const POST = withAuth(async (session, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, rejectSchema);
  if (!parsed.ok) return parsed.response;

  const db = getDb();
  const rows = await db
    .select({ organizationId: schema.template.organizationId })
    .from(schema.template)
    .where(eq(schema.template.id, id))
    .limit(1);
  const orgId = rows[0]?.organizationId;
  if (!orgId) return apiError(404, "not_found", "Plantilla no encontrada");
  const allowed =
    session.isSuperadmin ||
    (orgId === session.organizationId && canApproveTemplates(session.role));
  if (!allowed) {
    return apiError(403, "forbidden", "Solo el admin rechaza plantillas");
  }

  try {
    const template = await rejectTemplateInternally(
      orgId,
      id,
      parsed.data.reason ?? null
    );
    if (template.requestedById) {
      await notifyUser({
        userId: template.requestedById,
        organizationId: orgId,
        type: "template_rejected",
        title: "Plantilla devuelta",
        body: `«${template.name}» no fue aprobada${parsed.data.reason ? `: ${parsed.data.reason}` : ""}`,
        href: "/templates",
      });
    }
    return Response.json({ template: serializeTemplate(template) });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
