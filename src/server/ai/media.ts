import { transcribeAudio, isTranscriptionConfigured } from "@/lib/ai/transcribe";
import { fetchMedia, toDataUri } from "@/server/whatsapp/media";

/**
 * Comprensión de adjuntos por parte del agente (007): transcribe las notas de
 * voz y prepara las imágenes para el modelo de visión.
 *
 * Todo aquí degrada en silencio: si el proveedor no responde o el adjunto no
 * se puede leer, el agente sigue su turno sabiendo únicamente que llegó un
 * audio o una imagen.
 */

/** Marcador que ve el agente (y el operador) cuando no se pudo transcribir. */
export const AUDIO_SIN_TRANSCRIBIR = "[nota de voz — no se pudo transcribir]";

/**
 * Transcribe una nota de voz entrante. Devuelve el texto, el marcador de
 * fallo, o `null` si no hay nada que hacer (sin transcripción configurada).
 */
export async function transcribeInboundAudio(input: {
  organizationId: string;
  mediaId: string;
  mime: string | null;
}): Promise<string | null> {
  if (!isTranscriptionConfigured()) return null;

  const media = await fetchMedia(input.organizationId, input.mediaId);
  if (!media) return AUDIO_SIN_TRANSCRIBIR;

  const result = await transcribeAudio({
    bytes: media.bytes,
    mime: input.mime ?? media.mime,
  });
  if (!result.ok) {
    console.warn(`[media] transcripción fallida: ${result.detail}`);
    return AUDIO_SIN_TRANSCRIBIR;
  }
  return result.text;
}

/**
 * Data URI de una imagen entrante para el contenido multimodal, o `null` si
 * no se pudo descargar (el turno continúa sin ella).
 */
export async function imageDataUri(input: {
  organizationId: string;
  mediaId: string;
}): Promise<string | null> {
  const media = await fetchMedia(input.organizationId, input.mediaId);
  if (!media) return null;
  if (!media.mime.startsWith("image/")) return null;
  return toDataUri(media);
}
