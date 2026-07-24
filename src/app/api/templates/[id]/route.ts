import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  canApproveTemplates,
  canWriteTemplates,
  templatesRequireApproval,
} from "@/lib/permissions";
import { notifyOrgApprovers } from "@/server/notifications";
import {
  deleteTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
  updateTemplate,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  body: z.string().trim().min(1).max(1024),
  category: z.enum(["UTILITY", "MARKETING"]),
});

/** Edita cuerpo/categoría en Meta; la plantilla vuelve a revisión (pending).
 * Para el comercial, el cambio queda local esperando aprobación del admin. */
export const PATCH = withAuth(async (session, req: Request, ctx: Ctx) => {
  if (!canWriteTemplates(session.role)) {
    return apiError(403, "forbidden", "Tu rol no puede editar plantillas");
  }
  const { id } = await ctx.params;
  const parsed = await parseBody(req, updateSchema);
  if (!parsed.ok) return parsed.response;

  const requiresApproval = templatesRequireApproval(session.role);
  try {
    const template = await updateTemplate(session.organizationId, id, parsed.data, {
      requiresApproval,
      requestedById: requiresApproval ? session.userId : null,
    });
    if (requiresApproval) {
      await notifyOrgApprovers(session.organizationId, {
        type: "template_approval",
        title: "Plantilla por aprobar",
        body: `Los cambios en «${template.name}» esperan tu aprobación antes de ir a Meta`,
        href: "/templates",
        excludeUserId: session.userId,
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

/** Borrar toca Meta: reservado al admin de la empresa. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Ctx) => {
  if (!canApproveTemplates(session.role)) {
    return apiError(403, "forbidden", "Solo el admin puede eliminar plantillas");
  }
  const { id } = await ctx.params;
  try {
    await deleteTemplate(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
