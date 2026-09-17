import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { homeworksWebhookEnv } from "@/lib/env";
import { isValidHomeworksSyncPayload, syncHomeworksEntity, type HomeworksSyncPayload } from "@/lib/integrations/homeworks-sync";

/**
 * One-time (or repeatable) BULK backfill for records that already existed
 * in Homeworks before the live webhook started catching new ones — the
 * "New Customer" Zapier trigger only fires for customers created AFTER the
 * Zap is turned on, so it can never retroactively import the existing
 * customer base on its own. No Homeworks API or Zapier action can list
 * "all customers" in bulk either (checked: Homeworks' documented Zapier
 * triggers are all event-based, and there's no documented direct API), so
 * this endpoint accepts whatever export Homeworks' own UI can produce
 * (Settings/Reports — check there; not something this project can access
 * or verify without a live account) and applies the exact same safe,
 * idempotent upsert logic as the live webhook.
 *
 * Body: { records: HomeworksSyncPayload[] } — same per-record shape the
 * webhook uses. Processes sequentially (not parallel) and keeps going past
 * individual failures, so one bad row (e.g. a property referencing a
 * customer not yet synced) doesn't abort the whole batch — the response
 * reports success/failure per record so nothing fails silently.
 *
 * Same shared-secret auth as the webhook (HOMEWORKS_WEBHOOK_SECRET) — this
 * is not a lighter-security bulk-loading backdoor, just a batched version
 * of the same authenticated write path.
 */
export async function POST(request: Request) {
  if (!homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Homeworks integration is not configured (HOMEWORKS_WEBHOOK_SECRET missing)." }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-homeworks-webhook-secret");
  if (providedSecret !== homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Invalid or missing webhook secret." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("records" in body) || !Array.isArray((body as { records: unknown }).records)) {
    return NextResponse.json({ error: "Body must be { records: [...] } — an array of the same per-record shape the webhook uses." }, { status: 400 });
  }
  const records = (body as { records: unknown[] }).records;
  if (records.length === 0) {
    return NextResponse.json({ error: "records array is empty." }, { status: 400 });
  }
  if (records.length > 500) {
    return NextResponse.json({ error: "Max 500 records per request — split larger exports into batches." }, { status: 400 });
  }

  const invalid = records.filter((r) => !isValidHomeworksSyncPayload(r));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} of ${records.length} records are missing required fields (entity_type, homeworks_id, and customer_homeworks_id for property/invoice).` },
      { status: 400 },
    );
  }
  const validRecords = records as HomeworksSyncPayload[];

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase admin client is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  // Sequential, not Promise.all — customers should generally be imported
  // before the properties/invoices that reference them, and sequential
  // processing keeps that order predictable within one batch rather than
  // racing. For 500 records this is a few seconds, not a bottleneck.
  const results: Array<{ homeworks_id: string; entity_type: string } & ({ ok: true; id: string } | { ok: false; error: string })> = [];
  for (const record of validRecords) {
    const result = await syncHomeworksEntity(supabase, record);
    results.push(
      result.ok
        ? { homeworks_id: record.homeworks_id, entity_type: record.entity_type, ok: true, id: result.id }
        : { homeworks_id: record.homeworks_id, entity_type: record.entity_type, ok: false, error: result.error },
    );
  }

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}
