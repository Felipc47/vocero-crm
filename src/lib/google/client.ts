import { getEnv } from "@/lib/env";

/**
 * Adaptador de Google (004, constitución 1.3.0) — frontera de salida ÚNICA
 * hacia Google. Solo OAuth + Calendar. Las base URL son configurables para
 * apuntar a los mocks en el self-test (GOOGLE_OAUTH_BASE_URL /
 * GOOGLE_API_BASE_URL).
 */

export class GoogleApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.code = code;
  }

  /** true si el refresh token fue revocado o es inválido (reconexión). */
  get isAuthError(): boolean {
    return (
      this.status === 401 ||
      this.code === "invalid_grant" ||
      this.code === "unauthorized_client"
    );
  }

  /** true si el token vive pero le faltan permisos (p. ej. la casilla de
   * disponibilidad sin marcar en la pantalla de consentimiento). */
  get isScopeError(): boolean {
    return this.status === 403 && /insufficient/i.test(this.message);
  }
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function tokenRequest(
  params: Record<string, string>
): Promise<TokenResponse> {
  const env = getEnv();
  const res = await fetch(`${env.GOOGLE_OAUTH_BASE_URL}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json().catch(() => null)) as
    | (TokenResponse & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !data?.access_token) {
    throw new GoogleApiError(
      data?.error_description ?? `OAuth de Google falló (HTTP ${res.status})`,
      res.status,
      data?.error ?? null
    );
  }
  return data;
}

/** Scopes mínimos: crear eventos + leer disponibilidad (freeBusy) +
 * identificar la cuenta conectada. Si se agrega un scope, las conexiones
 * existentes deben RECONECTARSE en Ajustes → Calendario para otorgarlo. */
export const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy openid email";

/** URL de autorización (pantalla de consentimiento de Google). */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline", // pide refresh token
    prompt: "consent", // fuerza refresh token también en reconexiones
    state,
  });
  // La pantalla de consentimiento vive en accounts.google.com; en self-test el
  // mock expone la misma ruta bajo GOOGLE_OAUTH_BASE_URL.
  const base = env.GOOGLE_OAUTH_BASE_URL.includes("googleapis.com")
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : `${env.GOOGLE_OAUTH_BASE_URL}/auth`;
  return `${base}?${params.toString()}`;
}

/** Intercambia el authorization code por tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const env = getEnv();
  const data = await tokenRequest({
    code,
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
  };
}

/** Access token fresco a partir del refresh token guardado. */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string> {
  const env = getEnv();
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  return data.access_token;
}

/** Correo de la cuenta del access token (para mostrar en Ajustes). */
export async function fetchAccountEmail(accessToken: string): Promise<string> {
  const env = getEnv();
  const res = await fetch(`${env.GOOGLE_API_BASE_URL}/oauth2/v3/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => null)) as {
    email?: string;
  } | null;
  if (!res.ok || !data?.email) {
    throw new GoogleApiError(
      `No se pudo obtener el correo de la cuenta (HTTP ${res.status})`,
      res.status
    );
  }
  return data.email;
}
