import { mockGuard } from "@/lib/dev-guard";
import {
  getWaMockState,
  nextN,
  type MockTemplate,
} from "@/server/dev/wa-mock-state";

/**
 * Imitación de la Graph API (contrato mocks.md). El cliente real apunta aquí
 * cuando META_GRAPH_BASE_URL = <app>/api/dev/wa-mock/graph — el código de
 * producción no sabe que habla con un mock.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function bearerToken(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function invalidTokenResponse(): Response {
  return Response.json(
    {
      error: {
        message: "Invalid OAuth access token - Cannot parse access token",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "mock",
      },
    },
    { status: 401 }
  );
}

/** Quita el segmento de versión (v25.0/...) si viene en la ruta. */
function normalizePath(path: string[]): string[] {
  return path[0] && /^v\d+/.test(path[0]) ? path.slice(1) : path;
}

export async function GET(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  // GET {wabaId}/message_templates → lista para el sync
  if (path.length === 2 && path[1] === "message_templates") {
    const state = getWaMockState();
    return Response.json({
      data: state.templates.map((t) => ({
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: [{ type: "BODY", text: t.body }],
      })),
    });
  }

  // GET {leadgenId}?fields=field_data,... → detalle del lead (leadgen-mock, 004)
  if (path.length === 1 && path[0]?.startsWith("lgmock_")) {
    const { getLeadgenMockState } = await import(
      "@/server/dev/leadgen-mock-state"
    );
    const lead = getLeadgenMockState().leads.get(path[0]);
    if (!lead) {
      return Response.json(
        { error: { message: "Lead not found", type: "GraphMethodException", code: 100 } },
        { status: 404 }
      );
    }
    return Response.json({
      id: lead.leadgenId,
      form_id: lead.formId,
      campaign_name: lead.campaignName,
      ad_name: lead.adName,
      field_data: [
        { name: "full_name", values: [lead.name] },
        { name: "phone_number", values: [lead.phone] },
        { name: "email", values: [lead.email] },
      ],
    });
  }

  // GET {phoneNumberId}?fields=... → validación del wizard y límite de
  // mensajería (006; el escalón se fija desde /api/dev/wa-mock/tier).
  if (path.length === 1) {
    return Response.json({
      display_phone_number: "+52 55 0000 0000",
      verified_name: "Número de prueba Seomos",
      messaging_limit_tier: getWaMockState().messagingLimitTier,
      id: path[0],
    });
  }

  return Response.json({});
}

export async function POST(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // POST {phoneNumberId}/messages → registra en el outbox
  if (path.length === 2 && path[1] === "messages") {
    const state = getWaMockState();
    // Fallo inyectado por el self-test: simula el rechazo de Meta a un
    // destinatario concreto sin tumbar el resto del envío.
    if (state.failNextSends > 0) {
      state.failNextSends -= 1;
      // `auth`: el token cayó a mitad del envío (fallo del canal, no del
      // destinatario). `delivery`: Meta rechaza ese destinatario concreto.
      if (state.failNextMode === "auth") return invalidTokenResponse();
      if (state.failNextMode === "limit") {
        // 131048: el número alcanzó el límite por reportes de spam. Afecta a
        // TODOS los envíos, no solo a este destinatario.
        return Response.json(
          {
            error: {
              message: "(#131048) Spam rate limit hit",
              type: "WhatsAppBusinessApiError",
              code: 131048,
            },
          },
          { status: 400 }
        );
      }
      return Response.json(
        {
          error: {
            message: "(#131026) Message undeliverable",
            type: "WhatsAppBusinessApiError",
            code: 131026,
          },
        },
        { status: 400 }
      );
    }
    const n = nextN();
    state.outbox.push({
      n,
      phoneNumberId: path[0]!,
      to: String(body.to ?? ""),
      type: String(body.type ?? "text"),
      body,
      at: new Date().toISOString(),
    });
    return Response.json({
      messaging_product: "whatsapp",
      contacts: [{ input: body.to, wa_id: body.to }],
      messages: [{ id: `wamid.mock.out.${n}` }],
    });
  }

  // POST {wabaId}/message_templates → alta de plantilla (queda PENDING)
  if (path.length === 2 && path[1] === "message_templates") {
    const state = getWaMockState();
    const bodyComponent = (
      body.components as { type?: string; text?: string }[] | undefined
    )?.find((c) => (c.type ?? "").toUpperCase() === "BODY");
    const tpl: MockTemplate = {
      id: `tplmock_${nextN()}`,
      name: String(body.name ?? ""),
      language: String(body.language ?? "es_CO"),
      category: String(body.category ?? "UTILITY"),
      status: "PENDING",
      body: bodyComponent?.text ?? "",
    };
    state.templates.push(tpl);
    return Response.json({ id: tpl.id, status: "PENDING", category: tpl.category });
  }

  // POST {wabaId}/subscribed_apps → suscripción (con o sin override)
  if (path.length === 2 && path[1] === "subscribed_apps") {
    return Response.json({ success: true });
  }

  // POST {templateId} → edición del cuerpo/categoría; Meta la vuelve a revisar
  if (path.length === 1 && path[0]?.startsWith("tplmock_")) {
    const state = getWaMockState();
    const tpl = state.templates.find((t) => t.id === path[0]);
    if (!tpl) {
      return Response.json(
        {
          error: {
            message: "Template does not exist",
            type: "GraphMethodException",
            code: 100,
          },
        },
        { status: 404 }
      );
    }
    const bodyComponent = (
      body.components as { type?: string; text?: string }[] | undefined
    )?.find((c) => (c.type ?? "").toUpperCase() === "BODY");
    if (bodyComponent?.text !== undefined) tpl.body = bodyComponent.text;
    if (body.category !== undefined) tpl.category = String(body.category);
    tpl.status = "PENDING";
    return Response.json({ success: true });
  }

  return Response.json({});
}

/** DELETE {wabaId}/message_templates?name=…&hsm_id=… → baja real del estado. */
export async function DELETE(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const token = bearerToken(req);
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  if (path.length === 2 && path[1] === "message_templates") {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    const hsmId = url.searchParams.get("hsm_id");
    const state = getWaMockState();
    const before = state.templates.length;
    // Con hsm_id se borra solo esa versión; sin él, todas las del nombre.
    state.templates = state.templates.filter((t) =>
      hsmId ? t.id !== hsmId : t.name !== name
    );
    if (state.templates.length === before) {
      return Response.json(
        {
          error: {
            message: "Template does not exist",
            type: "GraphMethodException",
            code: 100,
          },
        },
        { status: 404 }
      );
    }
    return Response.json({ success: true });
  }

  return Response.json({ success: true });
}
