import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/integrations/google-calendar-oauth";
import { saveConnection } from "@/lib/integrations/google-calendar-connection";
import { validateOAuthCallback } from "@/lib/integrations/oauth-callback-validation";

function redirectWithStatus(request: Request, status: "connected" | "error", message?: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("gcal", status);
  if (message) url.searchParams.set("gcal_message", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const validation = validateOAuthCallback({
    searchParams: url.searchParams,
    cookieHeader: request.headers.get("cookie") ?? "",
    providerLabel: "Google",
    stateCookieName: "gcal_oauth_state",
  });
  if (!validation.ok) return redirectWithStatus(request, "error", validation.message);

  const redirectUri = new URL("/api/integrations/google-calendar/oauth/callback", request.url).toString();
  const result = await exchangeCodeForToken({ code: validation.code, redirectUri });
  if (!result.ok) return redirectWithStatus(request, "error", result.message);

  const saveResult = await saveConnection(result.data, user.id);
  if (!saveResult.ok) return redirectWithStatus(request, "error", saveResult.message);

  const response = redirectWithStatus(request, "connected");
  response.cookies.delete("gcal_oauth_state");
  return response;
}
