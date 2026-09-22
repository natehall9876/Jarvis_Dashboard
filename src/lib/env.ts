/**
 * Central place for reading and validating PUBLIC, client-safe environment
 * configuration only. Everything secret (OAuth client secrets, webhook
 * shared secrets, the Supabase service-role key) lives in
 * src/lib/env.server.ts instead. That file's own doc comment explains both
 * the real problem this split fixes and why it's enforced by a build-time
 * check on the actual shipped output (scripts/check-no-client-secrets.mjs)
 * rather than the `server-only` package, which was tried and reverted —
 * it broke this project's own Node-based tests.
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
