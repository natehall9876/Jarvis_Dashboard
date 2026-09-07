"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { supabaseEnv } from "@/lib/env";

/**
 * Browser-side Supabase client. Only ever uses the public URL and the
 * publishable (anon) key — never the service role key, which must not
 * reach client bundles.
 */
export function createSupabaseBrowserClient() {
  if (!supabaseEnv.url || !supabaseEnv.publishableKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }

  return createBrowserClient<Database>(
    supabaseEnv.url,
    supabaseEnv.publishableKey,
  );
}
