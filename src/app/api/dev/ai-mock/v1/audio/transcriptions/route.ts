import { mockGuard } from "@/lib/dev-guard";
import { getAiMockState } from "@/server/dev/ai-mock-state";

export const dynamic = "force-dynamic";

/**
 * Transcripción determinista para el self-test (007). El "audio" que sirve el
 * wa-mock es texto plano, así que transcribir es devolver ese contenido — con
 * eso el guion comprueba que el CRM descarga el adjunto, lo manda al proveedor
 * y guarda lo que recibe.
 *
 * `POST /api/dev/ai-mock/fail-next` fuerza el camino infeliz.
 */
export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const state = getAiMockState();
  if (state.failNextTranscriptions > 0) {
    state.failNextTranscriptions -= 1;
    return Response.json(
      { error: { message: "transcription unavailable", type: "server_error" } },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) {
    return Response.json(
      { error: { message: "missing file", type: "invalid_request_error" } },
      { status: 400 }
    );
  }
  const text = (await file.text().catch(() => "")).trim();
  return Response.json({ text: text || "(audio sin contenido reconocible)" });
}
