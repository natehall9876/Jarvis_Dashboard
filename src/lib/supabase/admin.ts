import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { supabaseEnv } from "@/lib/env";
import { supabaseServiceRoleKey } from "@/lib/env.server";

/**
 * Service-role Supabase client — bypasses RLS entirely. Two deliberate,
 * independently-justified exceptions to this project's "every query goes
 * through the authenticated, RLS-scoped client" rule exist (see
 * docs/AI_GUARDRAILS.md and docs/DATA_AUTHORITY.md):
 *
 * 1. The Homeworks webhook Route Handler — an external caller (Zapier) has
 *    no Supabase Auth session to present at all, so `to authenticated` RLS
 *    has nothing to authorize against. Trust comes entirely from proving
 *    knowledge of HOMEWORKS_WEBHOOK_SECRET, checked by the route before
 *    this client is ever touched.
 *
 * 2. lib/integrations/homeworks-connection.ts — the OAuth token store.
 *    Unlike the webhook, a real user session DOES exist here, but RLS
 *    can't protect this specific table: Postgres RLS can't distinguish
 *    "this app's own server code" from "an authenticated owner's browser
 *    calling Supabase's REST API directly with the same JWT," so any
 *    `to authenticated` policy permissive enough for the app to read its
 *    own tokens would equally let a direct REST call read raw bearer
 *    tokens for an external system — a materially worse exposure than
 *    ordinary business data. RLS denies `authenticated`/`anon` entirely
 *    on that one table (see supabase/homeworks-oauth-security-fix.sql);
 *    every exported function in that file independently calls
 *    `auth.getUser()` before touching it, since bypassing RLS means the
 *    application code is now the only access control for that table.
 *
 * Do not add a third case without the same reasoning: either no user
 * session exists to authorize against (webhook-style), or RLS is
 * structurally incapable of expressing the needed boundary and the calling
 * code independently verifies authentication itself (OAuth-store-style).
 * Never reach for this client just to route around an inconvenient RLS
 * policy on ordinary business data — that's lib/supabase/server.ts's job.
 */
export function createSupabaseAdminClient() {
  if (!supabaseEnv.url || !supabaseServiceRoleKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient<Database>(supabaseEnv.url, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
