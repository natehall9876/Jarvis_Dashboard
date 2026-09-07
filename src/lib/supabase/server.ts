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
 */
export async function createSupabaseServerClient() {
  if (!supabaseEnv.url || !supabaseEnv.publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render — safe to ignore because
          // middleware/proxy is responsible for refreshing session cookies.
        }
      },
    },
  });
}
