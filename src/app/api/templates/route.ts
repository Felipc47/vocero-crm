import { desc } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  canWriteTemplates,
  templatesRequireApproval,
} from "@/lib/permissions";
import { notifyOrgApprovers } from "@/server/notifications";
import {
  createTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const templates = await db
    .select()
    .from(schema.template)
    .where(scoped(schema.template.organizationId, session.organizationId))
    .orderBy(desc(schema.template.createdAt));
  return Response.json({ templates: templates.map(serializeTemplate) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  language: z.string().trim().min(2).max(10),
  category: z.enum(["UTILITY", "MARKETING"]),
  body: z.string().trim().min(1).max(1024),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canWriteTemplates(session.role)) {
    return apiError(403, "forbidden", "Tu rol no puede crear plantillas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const requiresApproval = templatesRequireApproval(session.role);
  try {
    const template = await createTemplate(session.organizationId, body.data, {
      requiresApproval,
      requestedById: requiresApproval ? session.userId : null,
    });
    if (requiresApproval) {
      // Aviso a quienes aprueban: el admin de la empresa y el superadmin.
      await notifyOrgApprovers(session.organizationId, {
        type: "template_approval",
        title: "Plantilla por aprobar",
        body: `«${template.name}» espera tu aprobación antes de enviarse a Meta`,
        href: "/templates",
        excludeUserId: session.userId,
      });
    }
    return Response.json(
      { template: serializeTemplate(template) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
