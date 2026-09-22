import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isIntegrationConfigured } from "@/lib/env.server";
import { buildAuthorizationUrl } from "@/lib/integrations/quickbooks-oauth";

/**
 * Starts the QuickBooks OAuth 2.0 flow. Owner-session-gated: this redirects
 * the owner's own browser to Intuit's real login/consent screen — there is
 * no way to complete this without the owner's own QuickBooks login.
 *
 * Requires QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET, and an Intuit
 * developer app with this exact redirect URI registered:
 *   https://<your-deployment>/api/integrations/quickbooks/oauth/callback
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isIntegrationConfigured("quickbooks")) {
    return NextResponse.json({ error: "QuickBooks is not configured (QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET missing)." }, { status: 503 });
  }

  const state = randomUUID();
  const redirectUri = new URL("/api/integrations/quickbooks/oauth/callback", request.url).toString();
  const authorizeUrl = buildAuthorizationUrl({ redirectUri, state });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("qb_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/quickbooks/oauth", maxAge: 600 });
  return response;
}
