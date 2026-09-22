import { integrationEnv } from "@/lib/env.server";

/**
 * Google OAuth 2.0 (standard Authorization Code flow) for read-only
 * Calendar access. Endpoints below are Google's real, stable, documented
 * URLs (developers.google.com/identity/protocols/oauth2), not guessed:
 *   - Authorize: accounts.google.com/o/oauth2/v2/auth
 *   - Token:     oauth2.googleapis.com/token
 *   - Revoke:    oauth2.googleapis.com/revoke
 * `access_type=offline` + `prompt=consent` are required to get a
 * refresh_token — without both, Google only returns one on the very first
 * consent ever granted, which is useless for a server that needs to persist
 * it. Scope is calendar.readonly only — this integration cannot write a
 * calendar event, matching "do not add external event writes."
 */
const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function buildAuthorizationUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", integrationEnv.googleCalendar.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  /** Only present on the first consent, or when prompt=consent forces re-issuance (which connect always does, deliberately). */
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type TokenResult = { ok: true; data: GoogleTokenResponse } | { ok: false; message: string };

async function postTokenRequest(body: Record<string, string>): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: integrationEnv.googleCalendar.clientId,
        client_secret: integrationEnv.googleCalendar.clientSecret,
        ...body,
      }).toString(),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach Google's token endpoint." };
  }
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `Google token endpoint returned ${response.status}: ${text.slice(0, 300)}` };
  }
  const data = (await response.json()) as GoogleTokenResponse;
  return { ok: true, data };
}

export async function exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<TokenResult> {
  return postTokenRequest({ grant_type: "authorization_code", code: params.code, redirect_uri: params.redirectUri });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  return postTokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Best-effort — revokes at Google so disconnect is real, not just local. Never blocks the local disconnect. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  } catch {
    // Local disconnect still proceeds.
  }
}
