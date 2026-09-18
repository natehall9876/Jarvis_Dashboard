import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { exchangeCodeForToken } from "@/lib/integrations/homeworks-oauth";
import { saveConnection } from "@/lib/integrations/homeworks-connection";

function redirectWithStatus(request: Request, status: "connected" | "error", message?: string): NextResponse {
  const url = new URL("/settings", request.url);
  url.searchParams.set("homeworks", status);
  if (message) url.searchParams.set("homeworks_message", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return redirectWithStatus(request, "error", `Homeworks declined the connection: ${errorParam}`);
  }
  if (!code) {
    return redirectWithStatus(request, "error", "No authorization code was returned.");
  }

  const cookieStore = request.headers.get("cookie") ?? "";
  const verifierMatch = cookieStore.match(/hw_oauth_verifier=([^;]+)/);
  const stateMatch = cookieStore.match(/hw_oauth_state=([^;]+)/);
  const codeVerifier = verifierMatch?.[1];
  const expectedState = stateMatch?.[1];

  if (!codeVerifier || !expectedState) {
    return redirectWithStatus(request, "error", "The connection attempt expired — try connecting again.");
  }
  if (state !== expectedState) {
    return redirectWithStatus(request, "error", "State mismatch — the connection attempt may have been tampered with. Try again.");
  }

  const redirectUri = new URL("/api/integrations/homeworks/oauth/callback", request.url).toString();
  const result = await exchangeCodeForToken({ code, redirectUri, codeVerifier });
  if (!result.ok) {
    return redirectWithStatus(request, "error", result.message);
  }

  const saveResult = await saveConnection(result.data, user.id);
  if (!saveResult.ok) {
    // The token exchange itself succeeded, but persisting it failed — the
    // real bug this fixes: this used to be un-checked, so a failed save
    // (e.g. the migration creating this table hadn't been run) still
    // redirected here claiming "connected" even though nothing was saved.
    return redirectWithStatus(request, "error", saveResult.message);
  }

  const response = redirectWithStatus(request, "connected");
  response.cookies.delete("hw_oauth_verifier");
  response.cookies.delete("hw_oauth_state");
  return response;
}
