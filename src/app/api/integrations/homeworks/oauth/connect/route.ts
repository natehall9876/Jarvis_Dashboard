import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isHomeworksOAuthConfigured } from "@/lib/env.server";
import { generateCodeVerifier, codeChallengeFromVerifier, buildAuthorizationUrl } from "@/lib/integrations/homeworks-oauth";

/**
 * Starts the real Homeworks OAuth 2.1 + PKCE flow (api.home.works),
 * verified live on 2026-09-18. Owner-session-gated (this redirects the
 * owner's own browser to Homeworks' real login/consent screen — there is
 * no way to complete this step without the owner's own Homeworks login,
 * by design; that's the whole point of OAuth).
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isHomeworksOAuthConfigured()) {
    return NextResponse.json({ error: "Homeworks OAuth is not configured (HOMEWORKS_OAUTH_CLIENT_ID missing)." }, { status: 503 });
  }

  const codeVerifier = generateCodeVerifier();
  const state = randomUUID();
  const redirectUri = new URL("/api/integrations/homeworks/oauth/callback", request.url).toString();
  const authorizeUrl = buildAuthorizationUrl({ redirectUri, codeChallenge: codeChallengeFromVerifier(codeVerifier), state });

  const response = NextResponse.redirect(authorizeUrl);
  // Short-lived, httpOnly — read once by the callback, then cleared. Never
  // readable by client-side JS; this is a PKCE verifier, not a credential,
  // but there's no reason to expose it either.
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/integrations/homeworks/oauth", maxAge: 600 };
  response.cookies.set("hw_oauth_verifier", codeVerifier, cookieOpts);
  response.cookies.set("hw_oauth_state", state, cookieOpts);
  return response;
}
