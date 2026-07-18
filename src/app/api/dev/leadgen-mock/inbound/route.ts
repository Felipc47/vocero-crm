import { z } from "zod";
import { parseBody } from "@/lib/api";
import { mockGuard } from "@/lib/dev-guard";
import { deliverToWebhook } from "@/server/dev/wa-mock-inbound";
import {
  buildLeadgenPayload,
  getLeadgenMockState,
  nextLeadgenN,
} from "@/server/dev/leadgen-mock-state";

/**
 * Simula un lead de Meta Lead Ads (self-test 004): registra el lead en el
 * store del mock y entrega el evento leadgen al webhook real por loopback
 * (firma incluida) — el código de producción no distingue el simulacro.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(7),
  email: z.string().trim().email(),
  campaignName: z.string().trim().optional(),
  adName: z.string().trim().optional(),
  formId: z.string().trim().optional(),
  /** Repite un id para probar la idempotencia. */
  leadgenId: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const guard = mockGuard();
  if (guard) return guard;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const state = getLeadgenMockState();
  const leadgenId = body.data.leadgenId ?? `lgmock_${nextLeadgenN()}`;
  const formId = body.data.formId ?? "form_mock_1";
  state.leads.set(leadgenId, {
    leadgenId,
    formId,
    name: body.data.name,
    phone: body.data.phone,
    email: body.data.email,
    campaignName: body.data.campaignName ?? "Meta Ads · Prueba",
    adName: body.data.adName ?? "Anuncio de prueba",
  });

  const res = await deliverToWebhook(
    buildLeadgenPayload({ leadgenId, formId })
  );
  return Response.json({ leadgenId, webhookStatus: res.status });
}
