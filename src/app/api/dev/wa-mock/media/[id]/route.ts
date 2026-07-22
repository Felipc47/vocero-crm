import { mockGuard } from "@/lib/dev-guard";
import { getWaMockState } from "@/server/dev/wa-mock-state";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Sirve los bytes del adjunto, como hace el CDN de Meta con su URL firmada. */
export async function GET(_req: Request, ctx: Ctx) {
  const guard = mockGuard();
  if (guard) return guard;

  const { id } = await ctx.params;
  const entry = getWaMockState().media.get(id);
  if (!entry) return new Response(null, { status: 404 });

  return new Response(Buffer.from(entry.bytes), {
    headers: { "content-type": entry.mime },
  });
}
