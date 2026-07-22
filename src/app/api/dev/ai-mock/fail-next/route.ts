import { mockGuard } from "@/lib/dev-guard";
import { getAiMockState } from "@/server/dev/ai-mock-state";

export const dynamic = "force-dynamic";

/**
 * Control del harness (007): fuerza fallos del proveedor de IA.
 * Body: `{ transcriptions?: number, vision?: number }`.
 */
export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as {
    transcriptions?: number;
    vision?: number;
  };
  const state = getAiMockState();
  if (typeof body.transcriptions === "number") {
    state.failNextTranscriptions = Math.max(0, Math.trunc(body.transcriptions));
  }
  if (typeof body.vision === "number") {
    state.failNextVision = Math.max(0, Math.trunc(body.vision));
  }
  return Response.json({ ...state });
}
