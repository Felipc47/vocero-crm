import { mockGuard } from "@/lib/dev-guard";

/**
 * Imitación de Google (OAuth + Calendar) para el self-test 004. El adaptador
 * real apunta aquí cuando GOOGLE_OAUTH_BASE_URL y GOOGLE_API_BASE_URL valen
 * <app>/api/dev/google-mock — el código de producción no sabe del mock.
 *
 * Rutas:
 * - GET  /auth                      → pantalla de consentimiento: redirige de
 *                                     vuelta con code + state (consiente solo).
 * - POST /token                     → tokens (authorization_code o refresh).
 * - GET  /oauth2/v3/userinfo        → correo de la cuenta conectada.
 * - POST /calendar/v3/calendars/primary/events → crea evento (queda en outbox).
 * - GET  /outbox                    → eventos creados (asserts del E2E).
 */
export const dynamic = "force-dynamic";

type MockEvent = {
  id: string;
  summary: string;
  attendees: { email: string }[];
  start: unknown;
  end: unknown;
};

type GoogleMockState = { events: MockEvent[]; n: number };

const globalForGoogle = globalThis as unknown as {
  __googleMockState?: GoogleMockState;
};

function state(): GoogleMockState {
  if (!globalForGoogle.__googleMockState) {
    globalForGoogle.__googleMockState = { events: [], n: 0 };
  }
  return globalForGoogle.__googleMockState;
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = (await ctx.params).path.join("/");
  const url = new URL(req.url);

  // Pantalla de consentimiento: redirige con code (el usuario "acepta" solo).
  if (path === "auth") {
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const stateParam = url.searchParams.get("state") ?? "";
    const back = new URL(redirectUri);
    back.searchParams.set("code", "gmock-code");
    back.searchParams.set("state", stateParam);
    return Response.redirect(back.toString(), 302);
  }

  if (path === "oauth2/v3/userinfo") {
    return Response.json({ email: "comercial@seomos.local" });
  }

  if (path === "outbox") {
    return Response.json({ events: state().events });
  }

  return Response.json({}, { status: 404 });
}

export async function POST(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = (await ctx.params).path.join("/");

  if (path === "token") {
    const body = await req.text();
    const params = new URLSearchParams(body);
    const grant = params.get("grant_type");
    if (grant === "authorization_code" && params.get("code") !== "gmock-code") {
      return Response.json(
        { error: "invalid_grant", error_description: "Código inválido (mock)" },
        { status: 400 }
      );
    }
    // Un refresh token que termina en -revoked simula la reconexión necesaria.
    if (
      grant === "refresh_token" &&
      (params.get("refresh_token") ?? "").endsWith("-revoked")
    ) {
      return Response.json(
        { error: "invalid_grant", error_description: "Token revocado (mock)" },
        { status: 400 }
      );
    }
    return Response.json({
      access_token: "gmock-access",
      refresh_token: grant === "authorization_code" ? "gmock-refresh" : undefined,
      expires_in: 3600,
      scope: "calendar.events openid email",
    });
  }

  // freeBusy: intervalos ocupados = eventos ya creados en el mock que tocan
  // la ventana pedida (así el self-test cubre la anti-sobreposición).
  if (path === "calendar/v3/freeBusy") {
    const body = (await req.json().catch(() => null)) as {
      timeMin?: string;
      timeMax?: string;
    } | null;
    const min = body?.timeMin ? new Date(body.timeMin) : null;
    const max = body?.timeMax ? new Date(body.timeMax) : null;
    const busy = state()
      .events.map((e) => ({
        start: (e.start as { dateTime?: string } | null)?.dateTime,
        end: (e.end as { dateTime?: string } | null)?.dateTime,
      }))
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .filter(
        (b) =>
          (!max || new Date(b.start) < max) && (!min || new Date(b.end) > min)
      );
    return Response.json({ calendars: { primary: { busy } } });
  }

  if (path === "calendar/v3/calendars/primary/events") {
    const body = (await req.json().catch(() => null)) as {
      summary?: string;
      attendees?: { email: string }[];
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    } | null;
    const s = state();
    const id = `gmockevt_${++s.n}`;
    const event: MockEvent = {
      id,
      summary: body?.summary ?? "(sin título)",
      attendees: body?.attendees ?? [],
      start: body?.start ?? null,
      end: body?.end ?? null,
    };
    s.events.push(event);
    return Response.json({
      id,
      htmlLink: `https://calendar.google.com/mock/${id}`,
      hangoutLink: `https://meet.google.com/mock-${s.n}`,
      start: body?.start,
      end: body?.end,
    });
  }

  return Response.json({}, { status: 404 });
}
