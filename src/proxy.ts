import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth"];

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
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isApiPath = pathname.startsWith("/api/");

  // Supabase's refresh-token rotation means concurrent requests (e.g. two
  // prefetched links firing at once) can race: whichever loses gets
  // "Invalid Refresh Token: Already Used" even though the session is
  // perfectly valid — the winner already rotated it. That's a transient
  // error, not "signed out", so only redirect on a clean no-session result
  // (no user AND no error) rather than treating every getUser() failure as
  // a logout.
  const definitelySignedOut = !user && !authError;

  if (definitelySignedOut && !isPublicPath && !isApiPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
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
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      // Next.js's Link component prefetches every visible sidebar link in the
      // background. Those prefetch requests used to hit this same proxy and
      // call getUser(), which can trigger a real Supabase refresh-token
      // rotation — racing against the actual navigation request for the same
      // cookie. The loser gets "Invalid Refresh Token: Already Used", and
      // Supabase's client treats that as a dead session and clears the auth
      // cookie, silently logging the user out of the page they were actually
      // navigating to. Prefetches don't need auth gating (RLS still protects
      // the data), so skip proxy entirely for them.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
