/**
 * Central place for reading and validating PUBLIC, client-safe environment
 * configuration only. Everything secret (OAuth client secrets, webhook
 * shared secrets, the Supabase service-role key) lives in
 * src/lib/env.server.ts instead, guarded by the `server-only` package so
 * importing it from client-reachable code is a build error rather than a
 * silent bundling accident — see that file's doc comment for the real
 * problem this split fixes.
 *
 * Nothing in this file throws at import time — pages and data-access
 * functions must be able to render "not configured" states instead of
 * crashing the build or the request when credentials are missing.
 */

export const supabaseEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
};

export function isSupabaseConfigured(): boolean {
  return supabaseEnv.url.length > 0 && supabaseEnv.publishableKey.length > 0;
}
