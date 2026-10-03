import { requireIntegrationOwner } from "@/lib/integrations/owner-auth";
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

export type SaveConnectionResult = { ok: true } | { ok: false; message: string };

export async function saveConnection(tokens: QuickBooksTokenResponse, realmId: string, _userId: string): Promise<SaveConnectionResult> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { ok: false, message: auth.message };
    if (_userId && _userId !== auth.userId) return { ok: false, message: "Authorization must be saved by the current owner." };

    const supabase = createSupabaseAdminClient();
    const now = Date.now();
    const accessExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
    const refreshExpiresAt = new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString();

    // Preserve the prior connection if this atomic replacement fails.
    const { data: existing, error: lookupError } = await supabase.from("quickbooks_oauth_connection").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) return { ok: false, message: "Could not read the previous connection before saving." };

    const { error: insertError } = await supabase.from("quickbooks_oauth_connection").upsert({
      id: existing?.id ?? "00000000-0000-4000-8000-000000000001",
      updated_at: new Date().toISOString(),
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      connected_by: auth.userId,
    });
    if (insertError) return { ok: false, message: `Couldn't save the QuickBooks connection: ${insertError.message}` };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save authorization. Check server configuration and retry; the prior connection was preserved." };
  }
}

export type ConnectionStatus =
  | { connected: false; error: null }
  | { connected: false; error: string }
  | { connected: true; connectedAt: string; realmId: string; refreshExpiresAt: string };

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { connected: false, error: auth.message };

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
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Could not read connection status." };
  }
}

export type ValidTokenResult = { ok: true; accessToken: string; realmId: string } | { ok: false; reason: "not_connected" | "refresh_failed" | "reauth_required" | "auth"; message: string };

/** Returns a definitely-valid access token, refreshing first if expired or about to be. */
// Coalesce parallel reads in this server process; no token is cached after completion.
let tokenRequest: Promise<ValidTokenResult> | null = null;

export async function getValidAccessToken(): Promise<ValidTokenResult> {
  const auth = await requireIntegrationOwner();
  if (!auth.ok) return { ok: false, reason: "auth", message: auth.message };

  if (!tokenRequest) {
    tokenRequest = readAndRefreshToken()
      .catch((): ValidTokenResult => ({ ok: false, reason: "refresh_failed", message: "Could not access the OAuth token store. Check server configuration and retry." }))
      .finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
}

async function readAndRefreshToken(): Promise<ValidTokenResult> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("quickbooks_oauth_connection")
    .select("id, updated_at, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, reason: "refresh_failed", message: "Could not read saved authorization. Retry when the token store is available." };
  if (!data) return { ok: false, reason: "not_connected", message: "QuickBooks isn't connected yet." };

  const safetyMarginMs = 2 * 60 * 1000;
  if (isExpiringWithin(data.refresh_token_expires_at, safetyMarginMs)) {
    return { ok: false, reason: "reauth_required", message: "The QuickBooks connection expired (Intuit refresh tokens last about 100 days) — reconnect from Settings." };
  }
  if (!isExpiringWithin(data.access_token_expires_at, safetyMarginMs)) {
    return { ok: true, accessToken: data.access_token, realmId: data.realm_id };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed.ok) return { ok: false, reason: refreshed.reauthRequired ? "reauth_required" : "refresh_failed", message: refreshed.message };

  const now = Date.now();
  const { data: saved, error: saveError } = await supabase
    .from("quickbooks_oauth_connection")
    .update({
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token,
      access_token_expires_at: new Date(now + refreshed.data.expires_in * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + refreshed.data.x_refresh_token_expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("updated_at", data.updated_at)
    .select("id")
    .maybeSingle();
  if (saveError || !saved) return { ok: false, reason: "refresh_failed", message: "Could not save refreshed tokens. The connection is not verified; retry or reconnect from Settings." };
  return { ok: true, accessToken: refreshed.data.access_token, realmId: data.realm_id };
}

export async function disconnectQuickBooks(): Promise<SaveConnectionResult> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { ok: false, message: auth.message };
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("quickbooks_oauth_connection")
      .select("id, updated_at, access_token").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return { ok: false, message: "Could not read the saved authorization." };
    if (!data) return { ok: true };
    const removed = await supabase.from("quickbooks_oauth_connection")
      .delete().eq("id", data.id).eq("updated_at", data.updated_at).select("id").maybeSingle();
    if (removed.error || !removed.data) return { ok: false, message: "Authorization was not disconnected. It changed or could not be removed; refresh Settings and retry." };
    await revokeToken(data.access_token);
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not disconnect authorization. Check server configuration and retry." };
  }
}
