"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsInRange, type EventFetchMeta, type HomeworksUpcomingJob } from "@/lib/integrations/homeworks-api";
import { rangeForDays, type DateRange } from "@/lib/integrations/homeworks-dates";
import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

export type JobPreviewRow = {
  homeworksId: string;
  title: string;
  customerName: string;
  startDate: string;
  action: "would_create" | "would_update" | "blocked_property_not_synced";
};

export type JobFetchStats = {
  range: DateRange;
  /** Distinct events Homeworks returned for the range, every status. */
  eventsRetrieved: number;
  pages: number;
  pageSize: number;
  rawRows: number;
  duplicatesDropped: number;
  /** Retrieved but not synced: not OPEN (completed/skipped/cancelled/waitlisted). */
  excludedNotOpen: number;
};

function statsFrom(meta: EventFetchMeta, retrieved: number, excludedNotOpen: number): JobFetchStats {
  return { range: meta.range, eventsRetrieved: retrieved, pages: meta.pages, pageSize: meta.pageSize, rawRows: meta.rawCount, duplicatesDropped: meta.duplicates, excludedNotOpen };
}

async function loadOpenEvents(range: DateRange | undefined): Promise<{ ok: true; jobs: HomeworksUpcomingJob[]; stats: JobFetchStats } | { ok: false; message: string }> {
  const fetched = await getEventsInRange(range ?? rangeForDays(7));
  if (!fetched.ok) return { ok: false, message: fetched.message };
  const open = fetched.data.events.filter((e) => e.status === "OPEN" && !e.isDeleted);
  return { ok: true, jobs: open, stats: statsFrom(fetched.data.meta, fetched.data.events.length, fetched.data.events.length - open.length) };
}

export type JobPreviewResult =
  | {
      ok: true;
      stats: JobFetchStats;
      totalUpcomingJobs: number;
      wouldCreate: number;
      wouldUpdate: number;
      blockedNoProperty: number;
      rows: JobPreviewRow[];
    }
  | { ok: false; message: string };

/**
 * Read-only. Jobs can only sync for a property that's already been synced
 * (jobs.property_id is a required foreign key — there is no "orphan job"
 * concept in Jarvis, and inventing a placeholder property would violate
 * "do not invent" as much as inventing a time or employee would). A job
 * whose property hasn't synced yet is reported as blocked, not silently
 * skipped or guessed at — sync customers/properties first if you see this.
 */
export async function previewHomeworksJobSync(range?: DateRange): Promise<JobPreviewResult> {
  const jobsResult = await loadOpenEvents(range);
  if (!jobsResult.ok) return { ok: false, message: jobsResult.message };

  const supabase = await createSupabaseServerClient();
  const [{ data: properties, error: propError }, { data: existingJobs, error: jobError }] = await Promise.all([
    supabase.from("properties").select("id, homeworks_id").not("homeworks_id", "is", null),
    supabase.from("jobs").select("id, homeworks_id").not("homeworks_id", "is", null),
  ]);
  if (propError) return { ok: false, message: `Couldn't read existing Jarvis properties: ${propError.message}` };
  if (jobError) return { ok: false, message: `Couldn't read existing Jarvis jobs: ${jobError.message}` };

  const syncedPropertyIds = new Set((properties ?? []).map((p) => p.homeworks_id as string));
  const existingJobIds = new Set((existingJobs ?? []).map((j) => j.homeworks_id as string));

  const rows: JobPreviewRow[] = jobsResult.jobs.map((job) => {
    const base = { homeworksId: job.id, title: job.title, customerName: job.customer?.fullName ?? "(unknown)", startDate: job.startDate };
    if (!job.property || !syncedPropertyIds.has(job.property.id)) {
      return { ...base, action: "blocked_property_not_synced" as const };
    }
    return { ...base, action: existingJobIds.has(job.id) ? ("would_update" as const) : ("would_create" as const) };
  });

  return {
    ok: true,
    stats: jobsResult.stats,
    totalUpcomingJobs: jobsResult.jobs.length,
    wouldCreate: rows.filter((r) => r.action === "would_create").length,
    wouldUpdate: rows.filter((r) => r.action === "would_update").length,
    blockedNoProperty: rows.filter((r) => r.action === "blocked_property_not_synced").length,
    rows,
  };
}

export type JobImportResultRow = { homeworksId: string; title: string; outcome: "created" | "updated" | "blocked" | "error"; detail?: string };

export type JobImportResult =
  | { ok: true; stats: JobFetchStats; created: number; updated: number; blocked: number; errors: number; rows: JobImportResultRow[] }
  | { ok: false; message: string };

/** Retired: automatic sync owns the Homeworks projections. Performs no I/O. */
export async function confirmHomeworksJobImport(_range?: DateRange): Promise<JobImportResult> {
  void _range; // Keep the retired action signature compatible with stale callers.
  return { ok: false, message: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
