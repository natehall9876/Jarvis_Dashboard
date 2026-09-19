import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, type TokenResponse } from "@/lib/integrations/homeworks-oauth";

/**
 * homeworks_oauth_connection holds live bearer tokens for an external
 * system — a materially different risk class than ordinary business data
 * (clients, jobs, invoices), which is why this file is the second
 * deliberate exception to "every query goes through the RLS-scoped
 * client" (see lib/supabase/admin.ts's updated doc comment for the first).
 *
 * Why RLS alone can't protect this table: Postgres RLS evaluates against
 * the calling role/JWT, and both "my server code's Supabase client" and "an
 * authenticated owner's own browser calling Supabase's REST API directly"
 * present as the exact same `authenticated` role with the exact same JWT —
 * RLS has no way to tell them apart. A `using (true)` policy (the
 * project's normal pattern for ordinary business tables) would let any
 * authenticated session read raw access/refresh tokens directly, bypassing
 * this file's "never import in a client component" discipline entirely,
 * since that discipline isn't something RLS can see or enforce.
 *
 * Scoping by `connected_by = auth.uid()` was considered and rejected —
 * verified by checking every caller (2026-09-18): getValidAccessToken() is
 * reached from Server Actions (verify/preview/import) that any signed-in
 * session can invoke, not necessarily the same session that originally
 * connected. This is a single shared business integration, not a per-user
 * resource, so scoping by row ownership would silently break the
 * integration for anyone except whoever happened to click Connect.
 *
 * The actual fix: RLS denies `authenticated`/`anon` entirely (no policy —
 * see supabase/homeworks-oauth-security-fix.sql), and every function here
 * uses the service-role client instead. Since that bypasses RLS
 * completely, this file — not the database — is now the only access
 * control, so every exported function independently verifies a real
 * Supabase Auth session before touching the table, rather than trusting
 * callers to have already checked (several current callers didn't).
 */
async function requireAuthenticatedUser(): Promise<{ ok: true; userId: string } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { ok: true, userId: user.id } : { ok: false };
}

export type SaveConnectionResult = { ok: true } | { ok: false; message: string };

/**
 * Single-row token store (this is a single-owner app — see
 * supabase/homeworks-oauth-migration.sql). Access tokens live 1 hour; this
 * refreshes automatically (with a 2-minute safety margin) whenever a
 * caller asks for a valid token, so callers never have to think about
 * expiry themselves.
 *
 * Returns a real result instead of void — a genuine bug caught 2026-09-18:
 * the previous version awaited the insert but never checked its `error`,
 * so if the migration creating this table hadn't actually been run yet
 * (relation does not exist), the insert silently failed and the OAuth
 * callback redirected with a false "connected" success message anyway —
 * the token was never persisted, so the very next page load correctly
 * showed "not connected" again. The owner saw exactly that: a one-time
 * "Connected" message that didn't survive a refresh.
 */
export async function saveConnection(tokens: TokenResponse, userId: string | null): Promise<SaveConnectionResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, message: "You must be signed in." };

  const supabase = createSupabaseAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  // Single-row table: clear any prior connection before inserting the new
  // one, rather than trying to upsert against a key that doesn't mean
  // anything here.
  const { error: deleteError } = await supabase.from("homeworks_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) return { ok: false, message: `Couldn't clear the previous connection: ${deleteError.message}` };

  const { error: insertError } = await supabase.from("homeworks_oauth_connection").insert({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope ?? null,
    connected_by: userId,
  });
  if (insertError) return { ok: false, message: `Couldn't save the Homeworks connection: ${insertError.message}` };
  return { ok: true };
}

export type ConnectionStatus =
  | { connected: false; error: null }
  | { connected: false; error: string }
  | { connected: true; connectedAt: string; scope: string | null };

/**
 * `error` is distinct from a plain "not connected" — e.g. the table not
 * existing yet (migration not applied) is a real, surfaceable problem, not
 * the same as "the owner just hasn't clicked Connect yet." Collapsing the
 * two previously hid exactly the failure mode that caused the Preview
 * button to seem to vanish (2026-09-18).
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { connected: false, error: null };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("homeworks_oauth_connection")
    .select("created_at, scope")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { connected: false, error: error.message };
  if (!data) return { connected: false, error: null };
  return { connected: true, connectedAt: data.created_at, scope: data.scope };
}

export type ValidTokenResult = { ok: true; accessToken: string } | { ok: false; reason: "not_connected" | "refresh_failed" | "auth"; message: string };

/** Returns a definitely-valid access token, refreshing first if the stored one is expired or about to be. */
export async function getValidAccessToken(): Promise<ValidTokenResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, reason: "auth", message: "You must be signed in." };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("homeworks_oauth_connection")
    .select("id, access_token, refresh_token, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_connected", message: "Homeworks isn't connected yet." };

  const expiresAt = new Date(data.expires_at).getTime();
  const safetyMarginMs = 2 * 60 * 1000;
  if (Date.now() < expiresAt - safetyMarginMs) {
    return { ok: true, accessToken: data.access_token };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed.ok) {
    return { ok: false, reason: "refresh_failed", message: refreshed.message };
  }
  const newExpiresAt = new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString();
  await supabase
    .from("homeworks_oauth_connection")
    .update({
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);
  return { ok: true, accessToken: refreshed.data.access_token };
}

export async function disconnectHomeworks(): Promise<void> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return;
  const supabase = createSupabaseAdminClient();
  await supabase.from("homeworks_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
