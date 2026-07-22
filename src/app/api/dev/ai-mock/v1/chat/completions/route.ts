import { mockGuard } from "@/lib/dev-guard";
import { aiMockCompletion, hasImage } from "@/server/dev/ai-mock";
import { getAiMockState } from "@/server/dev/ai-mock-state";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = (await req.json().catch(() => ({}))) as {
    messages?: Parameters<typeof aiMockCompletion>[0];
  };
  const messages = body.messages ?? [];

  // 007: simula un modelo que NO acepta imágenes — el turno del agente debe
  // continuar igualmente, sin la imagen.
  const state = getAiMockState();
  if (hasImage(messages) && state.failNextVision > 0) {
    state.failNextVision -= 1;
    return Response.json(
      {
        error: {
          message: "This model does not support image input",
          type: "invalid_request_error",
        },
      },
      { status: 400 }
    );
  }

  const content = aiMockCompletion(messages);
  return Response.json({
    id: "aimock",
    choices: [{ index: 0, message: { role: "assistant", content } }],
  });
}
