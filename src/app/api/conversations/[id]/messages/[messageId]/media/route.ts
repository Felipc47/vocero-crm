import { apiError, withAuth } from "@/lib/api";
import { getMessage } from "@/server/inbox/queries";
import { fetchMedia } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; messageId: string }> };

/**
 * Sirve el adjunto de un mensaje (nota de voz, imagen) bajo demanda: la UI
 * solo lo pide cuando el usuario presiona el adjunto — nada se descarga solo.
 * El binario se trae de Meta con el `media_id` guardado (la URL firmada
 * caduca; el id no) y nunca se persiste en el servidor.
 */
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id, messageId } = await ctx.params;
  const message = await getMessage(session.organizationId, id, messageId);
  if (!message) return apiError(404, "not_found", "Mensaje no encontrado");
  if (!message.mediaId) {
    return apiError(404, "no_media", "El mensaje no tiene adjunto");
  }

  const media = await fetchMedia(session.organizationId, message.mediaId);
  if (!media) {
    // Meta conserva los adjuntos un tiempo limitado; degradar sin colgarse.
    return apiError(
      404,
      "media_unavailable",
      "El adjunto ya no está disponible en WhatsApp"
    );
  }

  // `?download=1` (documentos): el navegador lo guarda como archivo con su
  // nombre original en lugar de intentar mostrarlo.
  const asDownload = new URL(req.url).searchParams.get("download") === "1";
  const filename = (message.mediaFilename ?? "adjunto").replace(/["\r\n]/g, "");
  return new Response(Buffer.from(media.bytes), {
    headers: {
      "content-type": media.mime || message.mediaMime || "application/octet-stream",
      // El navegador puede recordarlo un rato: evita re-descargar de Meta
      // cada vez que se reabre el hilo, sin dejar nada en caches compartidos.
      "cache-control": "private, max-age=3600",
      ...(asDownload
        ? {
            "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          }
        : {}),
    },
  });
});
