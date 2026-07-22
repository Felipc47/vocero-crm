import { getEnv } from "@/lib/env";
import { graphRequest, MetaApiError } from "@/lib/meta/client";
import { getCredentialsByOrg } from "@/server/whatsapp/credentials";

/**
 * Descarga de adjuntos de WhatsApp (007).
 *
 * Son DOS pasos: `GET /{media_id}` devuelve una URL firmada de corta vida, y
 * esa URL se descarga con el mismo token. Por eso se guarda el `media_id` (no
 * la URL) y el binario se pide cuando hace falta.
 *
 * Nunca lanza: devuelve `null` y quien llama degrada. Un adjunto ilegible no
 * puede tumbar la ingesta ni el turno del agente.
 */

/** Tope de descarga: por encima, el adjunto se ignora (protege memoria). */
const MAX_BYTES = 16 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type FetchedMedia = { bytes: Uint8Array; mime: string };

export async function fetchMedia(
  organizationId: string,
  mediaId: string
): Promise<FetchedMedia | null> {
  const credentials = await getCredentialsByOrg(organizationId);
  if (!credentials) return null;

  let url: string;
  let mime: string;
  try {
    const meta = await graphRequest<{
      url?: string;
      mime_type?: string;
      file_size?: number;
    }>(mediaId, { token: credentials.token });
    if (!meta.url) return null;
    if (typeof meta.file_size === "number" && meta.file_size > MAX_BYTES) {
      console.warn(`[media] ${mediaId} excede el tope (${meta.file_size} bytes)`);
      return null;
    }
    url = meta.url;
    mime = meta.mime_type ?? "application/octet-stream";
  } catch (err) {
    if (!(err instanceof MetaApiError)) throw err;
    console.warn(`[media] no se pudo resolver ${mediaId}: ${err.message}`);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // La URL firmada apunta al CDN de Meta, pero exige el mismo Bearer.
    const res = await fetch(rewriteForMock(url), {
      headers: { Authorization: `Bearer ${credentials.token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[media] descarga de ${mediaId} respondió ${res.status}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      console.warn(`[media] ${mediaId} excede el tope tras descargar`);
      return null;
    }
    return { bytes: new Uint8Array(buffer), mime };
  } catch (err) {
    console.warn(`[media] fallo al descargar ${mediaId}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * En el entorno de pruebas, Meta está sustituido por el wa-mock: la URL que
 * devuelve ya apunta ahí, así que esto es un no-op salvo que el mock emita
 * rutas relativas.
 */
function rewriteForMock(url: string): string {
  if (url.startsWith("http")) return url;
  return `${getEnv().APP_BASE_URL}${url}`;
}

/** Data URI listo para el contenido multimodal del proveedor LLM. */
export function toDataUri(media: FetchedMedia): string {
  const base64 = Buffer.from(media.bytes).toString("base64");
  return `data:${media.mime};base64,${base64}`;
}
