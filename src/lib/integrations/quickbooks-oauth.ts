import { integrationEnv } from "@/lib/env.server";

/**
 * Intuit QuickBooks Online OAuth 2.0 (standard Authorization Code flow, with
 * a client secret — unlike Homeworks' PKCE-only client, Intuit apps are
 * confidential clients). Endpoints below are Intuit's real, stable,
 * documented URLs (developer.intuit.com), not guessed:
 *   - Authorize: appcenter.intuit.com/connect/oauth2
 *   - Token:     oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 *   - Revoke:    developer.api.intuit.com/v2/oauth2/tokens/revoke
 *   - API base:  quickbooks.api.intuit.com/v3/company/{realmId}
 * The callback additionally receives `realmId` (Intuit's company id) as its
 * own query param — not part of the OAuth2 spec, but required for every
 * subsequent API call, so it's captured and stored alongside the tokens.
 */
const AUTHORIZATION_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_ENDPOINT = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QUICKBOOKS_API_BASE = "https://quickbooks.api.intuit.com/v3/company";

// Read-only accounting scope — matches "prepare read-only access", nothing here can write.
const SCOPE = "com.intuit.quickbooks.accounting";

export function buildAuthorizationUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", integrationEnv.quickbooks.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  /** Seconds, always 3600 today, but never hard-coded — read from the response. */
  expires_in: number;
  /** The refresh token's own, much longer expiry (Intuit: ~100 days) — distinct from access-token expiry. */
  x_refresh_token_expires_in: number;
  token_type: string;
};

type TokenResult = { ok: true; data: QuickBooksTokenResponse } | { ok: false; message: string };

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${integrationEnv.quickbooks.clientId}:${integrationEnv.quickbooks.clientSecret}`).toString("base64")}`;
}

async function postTokenRequest(body: Record<string, string>): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
        authorization: basicAuthHeader(),
      },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach the QuickBooks token endpoint." };
  }
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `QuickBooks token endpoint returned ${response.status}: ${text.slice(0, 300)}` };
  }
  const data = (await response.json()) as QuickBooksTokenResponse;
  return { ok: true, data };
}

export async function exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<TokenResult> {
  return postTokenRequest({ grant_type: "authorization_code", code: params.code, redirect_uri: params.redirectUri });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  return postTokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Best-effort — revokes the token at Intuit so a disconnect is real, not just a local delete. Never blocks the local disconnect on failure. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: basicAuthHeader() },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Local disconnect still proceeds — see quickbooks-connection.ts.
  }
}
