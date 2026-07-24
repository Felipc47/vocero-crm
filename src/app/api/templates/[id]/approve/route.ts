import { eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { canApproveTemplates } from "@/lib/permissions";
import { notifyUser } from "@/server/notifications";
import {
  serializeTemplate,
  submitTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Resuelve la organización dueña de la plantilla respetando el alcance: el
 * admin solo dentro de su empresa; el superadmin sobre cualquier empresa.
 */
async function resolveScope(
  session: { organizationId: string; role: string; isSuperadmin: boolean },
  templateId: string
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ organizationId: schema.template.organizationId })
    .from(schema.template)
    .where(eq(schema.template.id, templateId))
    .limit(1);
  const orgId = rows[0]?.organizationId;
  if (!orgId) return null;
  if (session.isSuperadmin) return orgId;
  if (orgId === session.organizationId && canApproveTemplates(session.role)) {
    return orgId;
  }
  return "forbidden";
}

/** Aprueba una plantilla pendiente: recién ahí viaja a Meta. */
export const POST = withAuth(async (session, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const orgId = await resolveScope(session, id);
  if (!orgId) return apiError(404, "not_found", "Plantilla no encontrada");
  if (orgId === "forbidden") {
    return apiError(403, "forbidden", "Solo el admin aprueba plantillas");
  }

  try {
    const template = await submitTemplate(orgId, id);
    if (template.requestedById) {
      await notifyUser({
        userId: template.requestedById,
        organizationId: orgId,
        type: "template_approved",
        title: "Plantilla aprobada",
        body: `«${template.name}» fue aprobada y ya está en revisión de Meta`,
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
