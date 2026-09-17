import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { supabaseEnv, supabaseServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client — bypasses RLS entirely. This is the ONE
 * deliberate exception to this project's "every query goes through the
 * authenticated, RLS-scoped client" rule (see docs/AI_GUARDRAILS.md and
 * docs/DATA_AUTHORITY.md), and it exists for exactly one reason: an
 * external webhook (e.g. Zapier, on Homeworks' behalf) has no Supabase
 * Auth session to present, so the normal `to authenticated` RLS policy has
 * nothing to authorize against. Trust here comes entirely from the caller
 * proving it knows HOMEWORKS_WEBHOOK_SECRET (checked by the route before
 * this client is ever touched), not from a user session.
 *
 * Only ever imported by a Route Handler that authenticates its caller via a
 * shared-secret header (never a page, Server Action, or normal API route —
 * those already have a real user session and must keep using
 * lib/supabase/server.ts instead).
 */
export function createSupabaseAdminClient() {
  if (!supabaseEnv.url || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient<Database>(supabaseEnv.url, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
