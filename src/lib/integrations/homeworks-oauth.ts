import { randomBytes, createHash } from "crypto";
import { homeworksOAuthEnv } from "@/lib/env.server";

/**
 * Real Homeworks OAuth 2.1 + PKCE client — verified live against
 * api.home.works on 2026-09-18 (discovery document + a real self-serve
 * client registration, not assumed from documentation alone). No client
 * secret exists for this flow; PKCE (RFC 7636, S256) is the entire security
 * mechanism, matching token_endpoint_auth_methods_supported: ["none"] from
 * the live discovery document.
 */
const AUTHORIZATION_ENDPOINT = "https://api.home.works/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.home.works/oauth/token";
export const HOMEWORKS_GRAPHQL_ENDPOINT = "https://api.home.works/graphql";

export function generateCodeVerifier(): string {
  // RFC 7636 requires 43-128 chars from [A-Za-z0-9-._~]; base64url of 32
  // random bytes lands at 43 chars, the minimum, which is sufficient
  // entropy (256 bits) and avoids any padding/length edge cases.
  return randomBytes(32).toString("base64url");
}

export function codeChallengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizationUrl(params: { redirectUri: string; codeChallenge: string; state: string }): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", homeworksOAuthEnv.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "openid company");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

type TokenResult = { ok: true; data: TokenResponse } | { ok: false; message: string };

export async function exchangeCodeForToken(params: { code: string; redirectUri: string; codeVerifier: string }): Promise<TokenResult> {
  return postTokenRequest({
    client_id: homeworksOAuthEnv.clientId,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  return postTokenRequest({
    client_id: homeworksOAuthEnv.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function postTokenRequest(body: Record<string, string>): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach the Homeworks token endpoint." };
  }
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `Homeworks token endpoint returned ${response.status}: ${text.slice(0, 300)}` };
  }
  const json = (await response.json()) as TokenResponse;
  return { ok: true, data: json };
}
