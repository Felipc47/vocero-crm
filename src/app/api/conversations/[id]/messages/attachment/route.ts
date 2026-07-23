import { apiError, withAuth } from "@/lib/api";
import { classifyWaMedia, formatBytes } from "@/lib/wa-media";
import { SEND_ERROR_STATUS, SendError, sendMedia } from "@/server/inbox/send";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Envía un adjunto (multipart: `file` + `caption` opcional) por WhatsApp.
 * La validación de formato/tamaño ocurre aquí ANTES de leer el binario a
 * memoria, y otra vez en `sendMedia` (defensa en profundidad).
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) {
    return apiError(422, "invalid_body", "Se esperaba multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid_body", "Falta el archivo (campo `file`)");
  }
  const caption = String(form.get("caption") ?? "").trim() || null;

  const spec = classifyWaMedia(file.type);
  if (!spec) {
    return apiError(
      422,
      "unsupported_media",
      "WhatsApp no acepta este formato. Permitidos: PDF, Word, Excel, PowerPoint, TXT, JPG, PNG, MP4/3GP y audios (AAC, MP3, OGG, AMR, M4A)."
    );
  }
  if (file.size > spec.maxBytes) {
    return apiError(
      413,
      "too_large",
      `El archivo supera el máximo permitido (${formatBytes(spec.maxBytes)})`
    );
  }

  try {
    const result = await sendMedia({
      conversationId: id,
      organizationId: session.organizationId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type,
      filename: file.name || "adjunto",
      caption,
    });
    return Response.json({ messageId: result.messageId });
  } catch (err) {
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
});
