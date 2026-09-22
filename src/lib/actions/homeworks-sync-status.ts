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
};

export type SyncStatusResult = { ok: true; status: HomeworksSyncStatus } | { ok: false; message: string };

const HW_EVENT_TYPES = ["homeworks_linked", "homeworks_enriched", "historical_sync"];

export async function getHomeworksSyncStatus(): Promise<SyncStatusResult> {
  const supabase = await createSupabaseServerClient();
  const [clientsLinked, clientsTotal, propertiesLinked, propertiesTotal, jobsLinked, jobsTotal, activity] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("properties").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("properties").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }).not("homeworks_id", "is", null),
    supabase.from("jobs").select("id", { count: "exact", head: true }),
    supabase.from("activity_log").select("id, created_at, event_type, summary").in("event_type", HW_EVENT_TYPES).order("created_at", { ascending: false }).limit(8),
  ]);

  const firstError = [clientsLinked, clientsTotal, propertiesLinked, propertiesTotal, jobsLinked, jobsTotal].find((r) => r.error)?.error;
  if (firstError) return { ok: false, message: firstError.message };
  // activity_log not existing yet is not fatal — the counts above are still real and useful.
  const activityRows = activity.error ? [] : (activity.data ?? []);

  const lastOf = (eventType: string) => activityRows.find((a) => a.event_type === eventType)?.created_at ?? null;

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
      lastLinkedAt: lastOf("homeworks_linked"),
      lastEnrichedAt: lastOf("homeworks_enriched"),
      lastHistoricalSyncAt: lastOf("historical_sync"),
    },
  };
}
