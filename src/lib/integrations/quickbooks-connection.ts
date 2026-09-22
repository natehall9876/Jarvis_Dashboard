import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, revokeToken, type QuickBooksTokenResponse } from "@/lib/integrations/quickbooks-oauth";
import { isExpiringWithin } from "@/lib/integrations/token-expiry";

/**
 * Token storage for QuickBooks — same reasoning and same pattern as
 * lib/integrations/homeworks-connection.ts (read that file's doc comment for
 * the full "why RLS alone can't protect this" argument; it applies
 * identically here). Service-role client + an explicit auth check in every
 * exported function, since bypassing RLS means this file is the only access
 * control left.
 */
async function requireAuthenticatedUser(): Promise<{ ok: true; userId: string } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { ok: true, userId: user.id } : { ok: false };
}

export type SaveConnectionResult = { ok: true } | { ok: false; message: string };

export async function saveConnection(tokens: QuickBooksTokenResponse, realmId: string, userId: string): Promise<SaveConnectionResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, message: "You must be signed in." };

  const supabase = createSupabaseAdminClient();
  const now = Date.now();
  const accessExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
  const refreshExpiresAt = new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString();

  const { error: deleteError } = await supabase.from("quickbooks_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) return { ok: false, message: `Couldn't clear the previous connection: ${deleteError.message}` };

  const { error: insertError } = await supabase.from("quickbooks_oauth_connection").insert({
    realm_id: realmId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: accessExpiresAt,
    refresh_token_expires_at: refreshExpiresAt,
    connected_by: userId,
  });
  if (insertError) return { ok: false, message: `Couldn't save the QuickBooks connection: ${insertError.message}` };
  return { ok: true };
}

export type ConnectionStatus =
  | { connected: false; error: null }
  | { connected: false; error: string }
  | { connected: true; connectedAt: string; realmId: string; refreshExpiresAt: string };

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { connected: false, error: null };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("quickbooks_oauth_connection")
    .select("created_at, realm_id, refresh_token_expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { connected: false, error: error.message };
  if (!data) return { connected: false, error: null };
  return { connected: true, connectedAt: data.created_at, realmId: data.realm_id, refreshExpiresAt: data.refresh_token_expires_at };
}

export type ValidTokenResult = { ok: true; accessToken: string; realmId: string } | { ok: false; reason: "not_connected" | "refresh_failed" | "reauth_required" | "auth"; message: string };

/** Returns a definitely-valid access token, refreshing first if expired or about to be. */
export async function getValidAccessToken(): Promise<ValidTokenResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, reason: "auth", message: "You must be signed in." };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("quickbooks_oauth_connection")
    .select("id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_connected", message: "QuickBooks isn't connected yet." };

  const safetyMarginMs = 2 * 60 * 1000;
  if (isExpiringWithin(data.refresh_token_expires_at, safetyMarginMs)) {
    return { ok: false, reason: "reauth_required", message: "The QuickBooks connection expired (Intuit refresh tokens last about 100 days) — reconnect from Settings." };
  }
  if (!isExpiringWithin(data.access_token_expires_at, safetyMarginMs)) {
    return { ok: true, accessToken: data.access_token, realmId: data.realm_id };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed.ok) return { ok: false, reason: "refresh_failed", message: refreshed.message };

  const now = Date.now();
  await supabase
    .from("quickbooks_oauth_connection")
    .update({
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token,
      access_token_expires_at: new Date(now + refreshed.data.expires_in * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + refreshed.data.x_refresh_token_expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);
  return { ok: true, accessToken: refreshed.data.access_token, realmId: data.realm_id };
}

export async function disconnectQuickBooks(): Promise<void> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("quickbooks_oauth_connection").select("access_token").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.access_token) await revokeToken(data.access_token);
  await supabase.from("quickbooks_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
