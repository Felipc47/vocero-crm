import { mockGuard } from "@/lib/dev-guard";
import { getWaMockState } from "@/server/dev/wa-mock-state";

export const dynamic = "force-dynamic";

/**
 * Control del harness: fija el escalón de mensajería que reporta el número
 * (`TIER_250`, `TIER_1K`, `TIER_UNLIMITED`…), para ejercer el aviso de tope
 * del envío masivo. Dev-only: 404 en producción.
 */
export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;
  const body = (await req.json().catch(() => ({}))) as { tier?: string };
  const state = getWaMockState();
  if (typeof body.tier === "string" && body.tier.trim()) {
    state.messagingLimitTier = body.tier.trim();
  }
  return Response.json({ messagingLimitTier: state.messagingLimitTier });
}
