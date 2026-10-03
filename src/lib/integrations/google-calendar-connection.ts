import { requireIntegrationOwner } from "@/lib/integrations/owner-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, revokeToken, type GoogleTokenResponse } from "@/lib/integrations/google-calendar-oauth";
import { isExpiringWithin } from "@/lib/integrations/token-expiry";

/** Same pattern as homeworks-connection.ts / quickbooks-connection.ts — read that file's doc comment for the full reasoning. */

export type SaveConnectionResult = { ok: true } | { ok: false; message: string };

export async function saveConnection(tokens: GoogleTokenResponse, _userId: string): Promise<SaveConnectionResult> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { ok: false, message: auth.message };
    if (_userId && _userId !== auth.userId) return { ok: false, message: "Authorization must be saved by the current owner." };
    if (!tokens.refresh_token) {
      // Connect always sends prompt=consent, so Google should always return one — a
      // missing refresh_token means the connection can't be kept alive past the
      // first hour, so treat it as a failed connect rather than silently storing
      // something useless.
      return { ok: false, message: "Google didn't return a refresh token — try disconnecting any prior Jarvis access at myaccount.google.com/permissions, then connect again." };
    }

    const supabase = createSupabaseAdminClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    // Preserve the prior connection if this atomic replacement fails.
    const { data: existing, error: lookupError } = await supabase.from("google_calendar_oauth_connection").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) return { ok: false, message: "Could not read the previous connection before saving." };

    const { error: insertError } = await supabase.from("google_calendar_oauth_connection").upsert({
      id: existing?.id ?? "00000000-0000-4000-8000-000000000001",
      updated_at: new Date().toISOString(),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: expiresAt,
      scope: tokens.scope,
      // A reconnect may authorize a different Google account; choose its calendar again.
      selected_calendar_id: null,
      selected_calendar_summary: null,
      connected_by: auth.userId,
    });
    if (insertError) return { ok: false, message: `Couldn't save the Google Calendar connection: ${insertError.message}` };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save authorization. Check server configuration and retry; the prior connection was preserved." };
  }
}

export type ConnectionStatus =
  | { connected: false; error: null }
  | { connected: false; error: string }
  | { connected: true; connectedAt: string; selectedCalendarId: string | null; selectedCalendarSummary: string | null };

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { connected: false, error: auth.message };

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("google_calendar_oauth_connection")
      .select("created_at, selected_calendar_id, selected_calendar_summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { connected: false, error: error.message };
    if (!data) return { connected: false, error: null };
    return { connected: true, connectedAt: data.created_at, selectedCalendarId: data.selected_calendar_id, selectedCalendarSummary: data.selected_calendar_summary };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Could not read connection status." };
  }
}

export type ValidTokenResult = { ok: true; accessToken: string; connectionVersion: string } | { ok: false; reason: "not_connected" | "refresh_failed" | "reauth_required" | "auth"; message: string };

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
    .from("google_calendar_oauth_connection")
    .select("id, updated_at, access_token, refresh_token, access_token_expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, reason: "refresh_failed", message: "Could not read saved authorization. Retry when the token store is available." };
  if (!data) return { ok: false, reason: "not_connected", message: "Google Calendar isn't connected yet." };

  const safetyMarginMs = 2 * 60 * 1000;
  if (!isExpiringWithin(data.access_token_expires_at, safetyMarginMs)) {
    return { ok: true, accessToken: data.access_token, connectionVersion: data.updated_at };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed.ok) {
    // A revoked/expired refresh token surfaces here as a normal API error from
    // Google (400 invalid_grant) — reported as-is rather than guessed at.
    return { ok: false, reason: refreshed.reauthRequired ? "reauth_required" : "refresh_failed", message: refreshed.message };
  }
  const connectionVersion = new Date().toISOString();
  const newExpiresAt = new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString();
  const { data: saved, error: saveError } = await supabase
    .from("google_calendar_oauth_connection")
    // Google's refresh response never includes a new refresh_token — the
    // original stays valid. Only the access token and its expiry are updated.
    .update({ access_token: refreshed.data.access_token, access_token_expires_at: newExpiresAt, updated_at: connectionVersion })
    .eq("id", data.id)
    .eq("updated_at", data.updated_at)
    .select("id")
    .maybeSingle();
  if (saveError || !saved) return { ok: false, reason: "refresh_failed", message: "Could not save refreshed tokens. The connection is not verified; retry or reconnect from Settings." };
  return { ok: true, accessToken: refreshed.data.access_token, connectionVersion };
}

export async function selectCalendar(calendarId: string, summary: string, connectionVersion: string): Promise<SaveConnectionResult> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { ok: false, message: auth.message };
    const supabase = createSupabaseAdminClient();
    if (!connectionVersion || !Number.isFinite(Date.parse(connectionVersion))) return { ok: false, message: "List calendars again before selecting one." };
    const { data, error } = await supabase
      .from("google_calendar_oauth_connection")
      .update({ selected_calendar_id: calendarId, selected_calendar_summary: summary, updated_at: new Date().toISOString() })
      .eq("updated_at", connectionVersion).select("id").maybeSingle();
    if (error || !data) return { ok: false, message: "Calendar selection was not saved. Authorization changed or storage is unavailable; list calendars again." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not save calendar selection. Check server configuration and retry." };
  }
}

export async function disconnectGoogleCalendar(): Promise<SaveConnectionResult> {
  try {
    const auth = await requireIntegrationOwner();
    if (!auth.ok) return { ok: false, message: auth.message };
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("google_calendar_oauth_connection")
      .select("id, updated_at, access_token").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return { ok: false, message: "Could not read the saved authorization." };
    if (!data) return { ok: true };
    const removed = await supabase.from("google_calendar_oauth_connection")
      .delete().eq("id", data.id).eq("updated_at", data.updated_at).select("id").maybeSingle();
    if (removed.error || !removed.data) return { ok: false, message: "Authorization was not disconnected. It changed or could not be removed; refresh Settings and retry." };
    await revokeToken(data.access_token);
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not disconnect authorization. Check server configuration and retry." };
  }
}
