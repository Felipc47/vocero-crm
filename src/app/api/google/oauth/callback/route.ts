import { cookies } from "next/headers";
import { withAuth } from "@/lib/api";
import { getEnv, isGoogleConfigured } from "@/lib/env";
import { exchangeCode, fetchAccountEmail } from "@/lib/google/client";
import { safeEqual } from "@/server/inbox/webhook";
import { saveGoogleConnection } from "@/server/google/credentials";

export const dynamic = "force-dynamic";

function backToSettings(result: string): Response {
  const env = getEnv();
  return Response.redirect(
    `${env.APP_BASE_URL}/settings/calendar?resultado=${result}`,
    302
  );
}

/**
 * Callback del OAuth de Google (004): valida state, intercambia el code y
 * guarda el refresh token cifrado. Nunca expone tokens; ante cualquier fallo
 * vuelve a Ajustes → Calendario con un código de resultado.
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!isGoogleConfigured()) return backToSettings("sin-configurar");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const expectedState = jar.get("google_oauth_state")?.value ?? "";
  jar.delete("google_oauth_state");

  if (!code || !expectedState || !safeEqual(state, expectedState)) {
    return backToSettings("estado-invalido");
  }

  try {
    const env = getEnv();
    const redirectUri = `${env.APP_BASE_URL}/api/google/oauth/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refreshToken) {
      // Sin refresh token no hay conexión duradera (p. ej. consentimiento
      // previo sin prompt=consent): pedir reconexión limpia.
      return backToSettings("sin-refresh-token");
    }
    const email = await fetchAccountEmail(tokens.accessToken);
    await saveGoogleConnection({
      organizationId: session.organizationId,
      accountEmail: email,
      refreshToken: tokens.refreshToken,
    });
    return backToSettings("conectado");
  } catch {
    return backToSettings("error");
  }
});
