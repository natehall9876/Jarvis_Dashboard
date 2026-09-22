import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, revokeToken, type GoogleTokenResponse } from "@/lib/integrations/google-calendar-oauth";

/** Same pattern as homeworks-connection.ts / quickbooks-connection.ts — read that file's doc comment for the full reasoning. */
async function requireAuthenticatedUser(): Promise<{ ok: true; userId: string } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { ok: true, userId: user.id } : { ok: false };
}

export type SaveConnectionResult = { ok: true } | { ok: false; message: string };

export async function saveConnection(tokens: GoogleTokenResponse, userId: string): Promise<SaveConnectionResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, message: "You must be signed in." };
  if (!tokens.refresh_token) {
    // Connect always sends prompt=consent, so Google should always return one — a
    // missing refresh_token means the connection can't be kept alive past the
    // first hour, so treat it as a failed connect rather than silently storing
    // something useless.
    return { ok: false, message: "Google didn't return a refresh token — try disconnecting any prior Jarvis access at myaccount.google.com/permissions, then connect again." };
  }

  const supabase = createSupabaseAdminClient();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error: deleteError } = await supabase.from("google_calendar_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) return { ok: false, message: `Couldn't clear the previous connection: ${deleteError.message}` };

  const { error: insertError } = await supabase.from("google_calendar_oauth_connection").insert({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: expiresAt,
    scope: tokens.scope,
    connected_by: userId,
  });
  if (insertError) return { ok: false, message: `Couldn't save the Google Calendar connection: ${insertError.message}` };
  return { ok: true };
}

export type ConnectionStatus =
  | { connected: false; error: null }
  | { connected: false; error: string }
  | { connected: true; connectedAt: string; selectedCalendarId: string | null; selectedCalendarSummary: string | null };

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { connected: false, error: null };

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
}

export type ValidTokenResult = { ok: true; accessToken: string } | { ok: false; reason: "not_connected" | "refresh_failed" | "auth"; message: string };

export async function getValidAccessToken(): Promise<ValidTokenResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, reason: "auth", message: "You must be signed in." };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("google_calendar_oauth_connection")
    .select("id, access_token, refresh_token, access_token_expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_connected", message: "Google Calendar isn't connected yet." };

  const safetyMarginMs = 2 * 60 * 1000;
  if (Date.now() < new Date(data.access_token_expires_at).getTime() - safetyMarginMs) {
    return { ok: true, accessToken: data.access_token };
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed.ok) {
    // A revoked/expired refresh token surfaces here as a normal API error from
    // Google (400 invalid_grant) — reported as-is rather than guessed at.
    return { ok: false, reason: "refresh_failed", message: refreshed.message };
  }
  const newExpiresAt = new Date(Date.now() + refreshed.data.expires_in * 1000).toISOString();
  await supabase
    .from("google_calendar_oauth_connection")
    // Google's refresh response never includes a new refresh_token — the
    // original stays valid. Only the access token and its expiry are updated.
    .update({ access_token: refreshed.data.access_token, access_token_expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq("id", data.id);
  return { ok: true, accessToken: refreshed.data.access_token };
}

export async function selectCalendar(calendarId: string, summary: string): Promise<SaveConnectionResult> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return { ok: false, message: "You must be signed in." };
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("google_calendar_oauth_connection")
    .update({ selected_calendar_id: calendarId, selected_calendar_summary: summary, updated_at: new Date().toISOString() })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) return;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("google_calendar_oauth_connection").select("access_token").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.access_token) await revokeToken(data.access_token);
  await supabase.from("google_calendar_oauth_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
}
