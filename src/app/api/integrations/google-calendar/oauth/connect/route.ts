import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isIntegrationConfigured } from "@/lib/env.server";
import { buildAuthorizationUrl } from "@/lib/integrations/google-calendar-oauth";

/**
 * Starts the Google OAuth flow for read-only Calendar access.
 *
 * Requires GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET, and a
 * Google Cloud OAuth client (Web application type) with this exact redirect
 * URI registered:
 *   https://<your-deployment>/api/integrations/google-calendar/oauth/callback
 * and the Calendar API enabled on the project.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isIntegrationConfigured("googleCalendar")) {
    return NextResponse.json({ error: "Google Calendar is not configured (GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET missing)." }, { status: 503 });
  }

  const state = randomUUID();
  const redirectUri = new URL("/api/integrations/google-calendar/oauth/callback", request.url).toString();
  const authorizeUrl = buildAuthorizationUrl({ redirectUri, state });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("gcal_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/google-calendar/oauth", maxAge: 600 });
  return response;
}
