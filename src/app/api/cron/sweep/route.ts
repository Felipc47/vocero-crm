import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { sweepPendingConversations } from "@/server/ai/sweep";

/**
 * Endpoint del barrido de recuperación, pensado para un cron externo
 * (tarea programada de Coolify). Protegido por AGENT_SWEEP_SECRET vía
 * `Authorization: Bearer <secreto>`. Sin secreto configurado, o con secreto
 * incorrecto, responde 404 (no revela la existencia del endpoint).
 */
export const dynamic = "force-dynamic";

function isAuthorized(req: Request, secret: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // Comparación en tiempo constante; longitudes distintas → no autorizado.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  const secret = getEnv().AGENT_SWEEP_SECRET;
  if (!secret || !isAuthorized(req, secret)) {
    return new Response(null, { status: 404 });
  }
  const result = await sweepPendingConversations();
  return Response.json({ ok: true, ...result });
}

export const POST = handle;
export const GET = handle;
