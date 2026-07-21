import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
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

/** Edita cuerpo/categoría en Meta; la plantilla vuelve a revisión (pending). */
export const PATCH = withAuth(async (session, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, updateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const template = await updateTemplate(session.organizationId, id, parsed.data);
    return Response.json({ template: serializeTemplate(template) });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Ctx) => {
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
