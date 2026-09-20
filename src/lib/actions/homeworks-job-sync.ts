"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUpcomingJobs, type HomeworksUpcomingJob } from "@/lib/integrations/homeworks-api";
import { syncHomeworksEntity } from "@/lib/integrations/homeworks-sync";
import { VALID_JOB_STATUSES } from "@/lib/actions/job-constants";

/**
 * Homeworks EventStatus -> Jarvis job status. Only OPEN is ever fetched by
 * getUpcomingJobs (see its query), so this only needs that one real case
 * mapped — no guessing at CLOSED/SKIPPED/CANCELLED/WAITLISTED equivalents
 * that aren't in scope yet.
 */
function mapStatus(homeworksStatus: string): (typeof VALID_JOB_STATUSES)[number] {
  return homeworksStatus === "OPEN" ? "scheduled" : "scheduled";
}

function buildNotes(job: HomeworksUpcomingJob): string {
  const parts = [`Homeworks: ${job.title}`];
  if (job.recurringEventId) parts.push("(recurring series)");
  return parts.join(" ");
}

export type JobPreviewRow = {
  homeworksId: string;
  title: string;
  customerName: string;
  startDate: string;
  action: "would_create" | "would_update" | "blocked_property_not_synced";
};

export type JobPreviewResult =
  | {
      ok: true;
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
export async function previewHomeworksJobSync(): Promise<JobPreviewResult> {
  const jobsResult = await getUpcomingJobs(7);
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

  const rows: JobPreviewRow[] = jobsResult.data.jobs.map((job) => {
    const base = { homeworksId: job.id, title: job.title, customerName: job.customer?.fullName ?? "(unknown)", startDate: job.startDate };
    if (!job.property || !syncedPropertyIds.has(job.property.id)) {
      return { ...base, action: "blocked_property_not_synced" as const };
    }
    return { ...base, action: existingJobIds.has(job.id) ? ("would_update" as const) : ("would_create" as const) };
  });

  return {
    ok: true,
    totalUpcomingJobs: jobsResult.data.jobs.length,
    wouldCreate: rows.filter((r) => r.action === "would_create").length,
    wouldUpdate: rows.filter((r) => r.action === "would_update").length,
    blockedNoProperty: rows.filter((r) => r.action === "blocked_property_not_synced").length,
    rows,
  };
}

export type JobImportResultRow = { homeworksId: string; title: string; outcome: "created" | "updated" | "blocked" | "error"; detail?: string };

export type JobImportResult =
  | { ok: true; created: number; updated: number; blocked: number; errors: number; rows: JobImportResultRow[] }
  | { ok: false; message: string };

/**
 * Only ever runs from the owner's own click (Server Action — this
 * environment has no way to invoke it itself). Re-runs the exact same
 * property-synced check as the preview server-side, so a stale preview
 * can never cause a write for a property that isn't actually linked.
 */
export async function confirmHomeworksJobImport(): Promise<JobImportResult> {
  const jobsResult = await getUpcomingJobs(7);
  if (!jobsResult.ok) return { ok: false, message: jobsResult.message };

  const supabase = await createSupabaseServerClient();
  const [{ data: properties, error: propError }, { data: preExistingJobs, error: jobError }] = await Promise.all([
    supabase.from("properties").select("id, homeworks_id").not("homeworks_id", "is", null),
    // Captured BEFORE any upsert runs below — a real bug, caught while
    // writing this (2026-09-20), fetched this same query AFTER the
    // upsert loop, which meant every row this function had just created
    // was already in the table by the time it was read, so every create
    // was misreported as an update. Same bug class as the customer
    // import's same-turn duplicate-detection gap fixed earlier this
    // session — a "before" snapshot has to actually be taken before, not
    // just placed earlier in the reasoning.
    supabase.from("jobs").select("homeworks_id").not("homeworks_id", "is", null),
  ]);
  if (propError) return { ok: false, message: `Couldn't read existing Jarvis properties: ${propError.message}` };
  if (jobError) return { ok: false, message: `Couldn't read existing Jarvis jobs: ${jobError.message}` };
  const syncedPropertyIds = new Set((properties ?? []).map((p) => p.homeworks_id as string));
  const preExistingJobIds = new Set((preExistingJobs ?? []).map((j) => j.homeworks_id as string));

  const rows: JobImportResultRow[] = [];
  for (const job of jobsResult.data.jobs) {
    if (!job.property || !syncedPropertyIds.has(job.property.id)) {
      rows.push({ homeworksId: job.id, title: job.title, outcome: "blocked", detail: "Property not yet synced — import customers/properties first." });
      continue;
    }
    const wasAlreadyPresent = preExistingJobIds.has(job.id);
    const price = Number(job.total);
    const result = await syncHomeworksEntity(supabase, {
      entity_type: "job",
      homeworks_id: job.id,
      property_homeworks_id: job.property.id,
      scheduled_date: job.startDate,
      // Only set when Homeworks itself reported a specific time — never
      // invented for an all-day event.
      scheduled_start_time: job.hasTime && job.startTime ? job.startTime : undefined,
      price: Number.isFinite(price) ? price : undefined,
      status: mapStatus(job.status),
      notes: buildNotes(job),
    });
    if (!result.ok) {
      rows.push({ homeworksId: job.id, title: job.title, outcome: "error", detail: result.error });
      continue;
    }
    rows.push({ homeworksId: job.id, title: job.title, outcome: wasAlreadyPresent ? "updated" : "created" });
  }

  revalidatePath("/jobs");
  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/settings");

  return {
    ok: true,
    created: rows.filter((r) => r.outcome === "created").length,
    updated: rows.filter((r) => r.outcome === "updated").length,
    blocked: rows.filter((r) => r.outcome === "blocked").length,
    errors: rows.filter((r) => r.outcome === "error").length,
    rows,
  };
}
