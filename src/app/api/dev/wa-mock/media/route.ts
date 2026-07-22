import { mockGuard } from "@/lib/dev-guard";
import { getWaMockState, nextN } from "@/server/dev/wa-mock-state";

export const dynamic = "force-dynamic";

/**
 * Control del harness (007): registra un adjunto que el wa-mock servirá como
 * si fuera media de WhatsApp, y devuelve su `media_id`.
 *
 * Body: `{ base64?, text?, mime? }` — `text` es un atajo para inventar bytes
 * legibles sin tener que codificar nada en el guion de prueba.
 */
export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as {
    base64?: string;
    text?: string;
    mime?: string;
  };
  const mime = body.mime ?? "application/octet-stream";
  const bytes = body.base64
    ? new Uint8Array(Buffer.from(body.base64, "base64"))
    : new Uint8Array(Buffer.from(body.text ?? "contenido de prueba", "utf8"));

  const mediaId = `mediamock_${nextN()}`;
  getWaMockState().media.set(mediaId, { bytes, mime });
  return Response.json({ mediaId, mime, bytes: bytes.byteLength });
}
