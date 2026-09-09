import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { supabaseEnv } from "@/lib/env";

/**
 * Server-side Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Reads/writes auth cookies via next/headers so a future
 * login flow (Supabase Auth) works without changing call sites.
 *
 * Uses the public URL and publishable (anon) key plus the caller's cookies —
 * row-level security in Supabase is what should scope access, not a
 * service-role bypass. No service-role key is read here or anywhere in the
 * app.
 *
 * Wrapped in React's `cache()` so every call with no arguments within the
 * same request (a page's own data-fetching, its layout's Topbar, etc.) reuses
 * one client instead of each constructing its own. Without this, several
 * independent clients can each decide — around once an hour, when the access
 * token nears expiry — that a refresh is due, and race each other for the
 * same one-time-use refresh token; the losers see that single query fail
 * with "Invalid Refresh Token: Already Used" even though the session is
 * fine. `signOut()` opts out by passing `allowSessionClear`, which changes
 * the cache key so it never shares this memoized instance.
 */
export const createSupabaseServerClient = cache(async function createSupabaseServerClient(options?: {
  allowSessionClear?: boolean;
}) {
  if (!supabaseEnv.url || !supabaseEnv.publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  const cookieStore = await cookies();
  const allowSessionClear = options?.allowSessionClear ?? false;

  return createServerClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: cookieOptions } of cookiesToSet) {
            // A query can trigger an internal token refresh when the access
            // token looks near expiry. If that refresh loses a race against
            // another request for the same one-time-use refresh token, the
            // client's fallback is to clear the session cookie — treating a
            // transient "already used" race as a real sign-out and silently
            // logging the user out mid-action. Only an explicit signOut()
            // call is allowed to actually clear the cookie.
            if (value === "" && !allowSessionClear) continue;
            cookieStore.set(name, value, cookieOptions);
          }
        } catch {
          // Called from a Server Component render — safe to ignore because
          // middleware/proxy is responsible for refreshing session cookies.
        }
      },
    },
  });
});
