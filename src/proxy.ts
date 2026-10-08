import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/env";

// /voice-lab is a development-only test harness (it 404s in production builds).
const PUBLIC_PATHS = ["/login", "/auth", "/reset-password", ...(process.env.NODE_ENV !== "production" ? ["/voice-lab"] : [])];

/**
 * Refreshes the Supabase auth session cookie on every request and gates
 * every dashboard page behind a signed-in session. This is what makes RLS
 * policies scoped to `authenticated` actually work end-to-end — without
 * this, Server Components never see a session and every query runs as the
 * anonymous role.
 *
 * API routes are intentionally left unredirected: they're not pages, and
 * their own Supabase calls already respect whatever session cookie (or
 * lack of one) came with the request.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!supabaseEnv.url || !supabaseEnv.publishableKey) {
    return response;
  }

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // getUser() internally refreshes the token when it looks near
        // expiry. If that refresh loses a race against another request for
        // the same one-time-use refresh token, the Supabase client's
        // fallback is to clear the session cookie (an empty value) —
        // treating a transient "already used" race as a real sign-out. That
        // would silently log the user out of the page they're actually
        // navigating to, even though their session is perfectly valid.
        // Proxy's job here is strictly to keep the session fresh, never to
        // sign anyone out — only the explicit signOut() action does that —
        // so drop any write that clears rather than rotates the cookie.
        const rotationsOnly = cookiesToSet.filter(({ value }) => value !== "");
        for (const { name, value } of rotationsOnly) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of rotationsOnly) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser().catch(() => ({
    data: { user: null },
    error: { name: "AuthVerificationUnavailable", code: undefined },
  }));

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isApiPath = pathname.startsWith("/api/");

  // Supabase's default recovery email (no custom SMTP configured, so its
  // template can't be edited to link into the app directly) redirects the
  // browser to the bare Site URL after verifying the token. When the
  // project uses the PKCE flow, that arrives as `?code=...` on whatever
  // page the Site URL points at — a real query param, unlike the
  // hash-fragment variant (handled client-side, see
  // components/auth/recovery-redirect.tsx), so it's visible here. Hand it
  // straight to /reset-password, which exchanges it for a session itself;
  // must run before the signed-out check below since this request has no
  // session yet and would otherwise be redirected to /login, losing the code.
  //
  // Excludes /api/* — a real bug caught by a live e2e test (2026-09-18):
  // the Homeworks OAuth callback (/api/integrations/homeworks/oauth/
  // callback?code=...) uses the same `?code=` convention for a completely
  // unrelated OAuth authorization code, and was being silently hijacked
  // to /reset-password before ever reaching its own route handler.
  // Supabase's recovery redirect always lands on a normal page (the Site
  // URL), never directly on an API route, so this exclusion can't
  // reintroduce the original bug this code was written for.
  const recoveryCode = request.nextUrl.searchParams.get("code");
  if (recoveryCode && pathname !== "/reset-password" && !isApiPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/reset-password";
    return NextResponse.redirect(url);
  }

  // Supabase's refresh-token rotation means concurrent requests (e.g. two
  // prefetched links firing at once) can race: whichever loses gets
  // "Invalid Refresh Token: Already Used" even though the session is
  // perfectly valid — the winner already rotated it. That's a transient
  // error, not "signed out". Redirect missing/invalid sessions to login;
  // temporary failures get a retry page without clearing session cookies.
  // A request with no session cookie at all (a fresh, never-logged-in
  // visitor) doesn't come back as "no user, no error" — the Supabase SSR
  // client surfaces it as a distinctly-named AuthSessionMissingError. That's
  // a clean, unambiguous "there was never a session here," unlike a
  // refresh-token race (a different, differently-named transient error),
  // so it's safe to treat as a real sign-out even though other auth errors
  // are deliberately not.
  const invalidSessionCodes = new Set([
    "bad_jwt", "session_not_found", "session_expired",
    "refresh_token_not_found", "user_not_found", "user_banned",
  ]);
  const definitelySignedOut = !user && (
    !authError || authError.name === "AuthSessionMissingError" ||
    (authError.code !== undefined && invalidSessionCodes.has(authError.code))
  );

  if (!user && !isPublicPath && !isApiPath) {
    const destination = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirectTo", destination);
    if (definitelySignedOut) return NextResponse.redirect(url);

    // A temporary auth outage or a concurrent token-refresh race is not a
    // logout. Retain cookies, but never render anonymous RLS results as an
    // empty schedule, zero revenue, or missing customers.
    const signInHref = "/login?" + new URLSearchParams({ redirectTo: destination });
    return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Jarvis — Connection check</title>
<style>body{margin:0;background:#111;color:#f4f4f4;font:18px system-ui;line-height:1.6}main{max-width:36rem;padding:4rem 1.5rem;margin:auto}a{color:#72f238;margin-right:1.5rem}</style></head>
<body><main><h1>Jarvis needs to verify your sign-in</h1><p>Your business data has not been loaded. This does not mean your customers or schedule are empty.</p><p>Try again in a moment. If this continues, sign in again.</p><a href="">Try again</a><a href="${signInHref}">Sign in</a></main></body></html>`, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "retry-after": "5" },
    });
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      // Guard prefetches too: caching an anonymous RSC response can make a
      // later navigation look as if saved business records disappeared.

    },
  ],
};
