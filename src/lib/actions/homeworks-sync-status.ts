"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Derived sync status — no new table. "Linked" counts are computed by
 * counting rows with a real Homeworks ID against the table's total, and
 * "recent activity" reads the same activity_log every other feature already
 * writes to (homeworks_linked, homeworks_enriched, historical_sync). A
 * "Connected" badge from stored credentials alone is not evidence of a
 * working sync — this shows what has actually happened.
 */
export type HomeworksSyncStatus = {
  clientsLinked: number;
  clientsTotal: number;
  propertiesLinked: number;
  propertiesTotal: number;
  jobsLinked: number;
  jobsTotal: number;
  recentActivity: { id: string; createdAt: string; eventType: string; summary: string }[];
  lastLinkedAt: string | null;
  lastEnrichedAt: string | null;
  lastHistoricalSyncAt: string | null;
  /**
   * The linked/total counts above can't tell a row that arrived through the
   * live Zapier webhook apart from one from a one-time bulk import or the
   * manual link/apply flow — they all write the same homeworks_id column.
   * This is the actual evidence that the live webhook has delivered
   * anything recently: syncHomeworksEntity now logs an activity_log row
   * (event_type "homeworks_webhook_sync") on every successful webhook-
   * triggered upsert (see lib/integrations/homeworks-sync.ts). Null means
   * exactly what it says — no webhook delivery has ever been recorded —
   * not "unknown".
   */
  lastWebhookDeliveryAt: string | null;
  /** Same idea, for the bulk-import endpoint (event_type "homeworks_bulk_import"). */
  lastBulkImportAt: string | null;
};

export type SyncStatusResult = { ok: true; status: HomeworksSyncStatus } | { ok: false; message: string };

const HW_EVENT_TYPES = ["homeworks_linked", "homeworks_enriched", "historical_sync", "homeworks_webhook_sync", "homeworks_bulk_import"] as const;

/**
 * One row per event type — a shared "most recent N of any HW type" window
 * would let a burst of frequent events (e.g. many webhook deliveries) crowd
 * a rarer type (e.g. one historical backfill) out of the window entirely,
 * silently making an honest "last happened at X" report back into a false
 * "Never". Five small indexed queries in parallel is cheap and exact; this
 * runs on-demand (the owner clicks "Check sync status"), not on page load.
 */
async function lastEventOf(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, eventType: (typeof HW_EVENT_TYPES)[number]): Promise<string | null> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("created_at")
    .eq("event_type", eventType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.created_at;
}

export async function getHomeworksSyncStatus(): Promise<SyncStatusResult> {
  const supabase = await createSupabaseServerClient();
  const [
    clientsLinked,
    clientsTotal,
    propertiesLinked,
    propertiesTotal,
    jobsLinked,
    jobsTotal,
    recentActivity,
    lastLinkedAt,
    lastEnrichedAt,
    lastHistoricalSyncAt,
    lastWebhookDeliveryAt,
    lastBulkImportAt,
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("properties").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("activity_log").select("id, created_at, event_type, summary").in("event_type", HW_EVENT_TYPES).order("created_at", { ascending: false }).limit(20),
    lastEventOf(supabase, "homeworks_linked"),
    lastEventOf(supabase, "homeworks_enriched"),
    lastEventOf(supabase, "historical_sync"),
    lastEventOf(supabase, "homeworks_webhook_sync"),
    lastEventOf(supabase, "homeworks_bulk_import"),
  ]);

  const firstError = [clientsLinked, clientsTotal, propertiesLinked, propertiesTotal, jobsLinked, jobsTotal].find((r) => r.error)?.error;
  if (firstError) return { ok: false, message: firstError.message };
  // activity_log not existing yet is not fatal — the counts above are still real and useful.
  const activityRows = recentActivity.error ? [] : (recentActivity.data ?? []);

  return {
    ok: true,
    status: {
      clientsLinked: clientsLinked.count ?? 0,
      clientsTotal: clientsTotal.count ?? 0,
      propertiesLinked: propertiesLinked.count ?? 0,
      propertiesTotal: propertiesTotal.count ?? 0,
      jobsLinked: jobsLinked.count ?? 0,
      jobsTotal: jobsTotal.count ?? 0,
      recentActivity: activityRows.map((a) => ({ id: a.id, createdAt: a.created_at, eventType: a.event_type, summary: a.summary })),
      lastLinkedAt,
      lastEnrichedAt,
      lastHistoricalSyncAt,
      lastWebhookDeliveryAt,
      lastBulkImportAt,
    },
  };
}
