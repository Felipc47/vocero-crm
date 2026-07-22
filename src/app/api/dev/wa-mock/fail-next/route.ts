import { mockGuard } from "@/lib/dev-guard";
import { getWaMockState } from "@/server/dev/wa-mock-state";

export const dynamic = "force-dynamic";

/**
 * Control del harness: hace que los próximos `count` envíos a /messages sean
 * rechazados por «Meta». Sirve para ejercer el camino infeliz del envío
 * masivo (un destinatario falla, la campaña sigue, luego se reintenta).
 */
export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const body = (await req.json().catch(() => ({}))) as {
    count?: number;
    mode?: "delivery" | "auth" | "limit";
  };
  const count = Number.isFinite(body.count) ? Number(body.count) : 1;
  const state = getWaMockState();
  state.failNextSends = Math.max(0, Math.trunc(count));
  state.failNextMode =
    body.mode === "auth" || body.mode === "limit" ? body.mode : "delivery";
  return Response.json({
    failNextSends: state.failNextSends,
    failNextMode: state.failNextMode,
  });
}
