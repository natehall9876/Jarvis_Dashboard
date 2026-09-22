import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { homeworksWebhookEnv } from "@/lib/env.server";
import { isValidHomeworksSyncPayload, syncHomeworksEntity } from "@/lib/integrations/homeworks-sync";
import { INVALID_PAYLOAD_MESSAGE, INVALID_SECRET_MESSAGE, logSyncFailure } from "@/lib/integrations/homeworks-sync-failures";

/**
 * Receives events from a Zapier "Webhooks by Zapier" action, triggered by
 * one of Homeworks' native Zapier triggers (New Customer, New Property,
 * New Invoice, New Payment, etc. — homeworks.com/product/integrations).
 * This was the only integration path found until 2026-09-18 — a real
 * direct API (OAuth 2.1 + PKCE + GraphQL, api.home.works) now also exists
 * and is used by lib/integrations/homeworks-api.ts / homeworks-oauth.ts /
 * homeworks-connection.ts for direct, on-demand reads. This webhook path
 * stays in place: it's push-based (fires the moment Homeworks changes,
 * no polling) and already proven working end-to-end, so there's no reason
 * to replace it now that a pull-based alternative also exists.
 *
 * This endpoint defines its OWN expected JSON shape — the exact mapping
 * from Homeworks' real fields into that shape happens inside Zapier's own
 * field-mapping UI when the Zap is built, so nothing here guesses at
 * Homeworks' internal field names. See lib/integrations/homeworks-sync.ts
 * for the exact shape and the shared upsert logic (also used by the bulk
 * backfill endpoint at ../import/route.ts).
 *
 * Auth: a shared secret in the `x-homeworks-webhook-secret` header, checked
 * against HOMEWORKS_WEBHOOK_SECRET — there is no Supabase Auth session for
 * a server-to-server call like this to present, so this is the only gate.
 * On success, writes go through the service-role client (the one narrow,
 * documented exception to this project's no-service-role-key rule — see
 * lib/supabase/admin.ts) since RLS's `to authenticated` policy has no
 * session here to authorize against.
 *
 * Every rejection path (wrong secret, malformed body, a well-formed record
 * that fails to sync) is logged to homeworks_sync_failures — see that
 * table's migration for why a failure can't be logged to activity_log
 * instead (no real business record to attach it to). Logging is best-effort
 * everywhere it isn't already required for the request to succeed: a wrong
 * secret or a malformed body is rejected immediately regardless of whether
 * the database happens to be reachable right now (matches the pre-existing
 * behavior exactly — these checks never depended on the database before,
 * and still don't) — only the actual sync step hard-requires a working
 * admin client, same as always.
 */
async function tryCreateAdminClient(): Promise<ReturnType<typeof createSupabaseAdminClient> | null> {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Homeworks webhook is not configured (HOMEWORKS_WEBHOOK_SECRET missing)." }, { status: 503 });
  }

  const providedSecret = request.headers.get("x-homeworks-webhook-secret");
  if (providedSecret !== homeworksWebhookEnv.secret) {
    // The provided value is never logged or echoed back — INVALID_SECRET_MESSAGE
    // is a fixed constant, not built from the request. See its doc comment.
    const logClient = await tryCreateAdminClient();
    if (logClient) await logSyncFailure(logClient, { origin: "webhook", reason: "invalid_secret", errorMessage: INVALID_SECRET_MESSAGE });
    return NextResponse.json({ error: INVALID_SECRET_MESSAGE }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const logClient = await tryCreateAdminClient();
    if (logClient) await logSyncFailure(logClient, { origin: "webhook", reason: "invalid_payload", errorMessage: "The request body was not valid JSON." });
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidHomeworksSyncPayload(body)) {
    // Only the shape of the bad payload is recorded (its top-level keys),
    // not its full contents — enough to debug a Zap's field mapping without
    // storing an unbounded arbitrary external payload.
    const receivedKeys = typeof body === "object" && body !== null ? Object.keys(body) : [];
    const logClient = await tryCreateAdminClient();
    if (logClient) await logSyncFailure(logClient, { origin: "webhook", reason: "invalid_payload", errorMessage: INVALID_PAYLOAD_MESSAGE, detail: { receivedKeys } });
    return NextResponse.json({ error: INVALID_PAYLOAD_MESSAGE }, { status: 400 });
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase admin client is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const result = await syncHomeworksEntity(supabase, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
