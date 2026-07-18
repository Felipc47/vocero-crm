import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { apiError, withAuth } from "@/lib/api";
import { getEnv, isGoogleConfigured } from "@/lib/env";
import { buildAuthUrl } from "@/lib/google/client";

export const dynamic = "force-dynamic";

/**
 * Inicia el OAuth de Google (004): redirige a la pantalla de consentimiento
 * con un `state` anti-CSRF guardado en cookie httpOnly.
 */
export const GET = withAuth(async () => {
  if (!isGoogleConfigured()) {
    return apiError(
      409,
      "google_not_configured",
      "Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en la instancia"
    );
  }
  const env = getEnv();
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https"),
    maxAge: 600,
    path: "/",
  });
  const redirectUri = `${env.APP_BASE_URL}/api/google/oauth/callback`;
  return Response.redirect(buildAuthUrl(redirectUri, state), 302);
});
