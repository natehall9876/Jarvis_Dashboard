"use server";

import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsInRange, type EventFetchMeta, type HomeworksUpcomingJob } from "@/lib/integrations/homeworks-api";
import { planHistoricalSync, type HistoricalEvent, type HistoricalPlan } from "@/lib/integrations/homeworks-historical";
import { validateRange, type DateRange } from "@/lib/integrations/homeworks-dates";

/** Read-only historical comparison; projection writes use automatic sync. */
async function fetchDetail(range: DateRange): Promise<{ ok: true; events: HomeworksUpcomingJob[]; meta: EventFetchMeta } | { ok: false; message: string }> {
  const validation = validateRange(range);
  if (!validation.ok) return { ok: false, message: validation.message };
  const result = await getEventsInRange(range, { detail: true });
  if (!result.ok) return result;
  return { ok: true, events: result.data.events, meta: result.data.meta };
}

async function buildPlan(range: DateRange) {
  const fetched = await fetchDetail(range);
  if (!fetched.ok) return fetched;

  const supabase = await createSupabaseServerClient();
  const [{ data: jobs, error: jobsError }, { data: properties, error: propsError }, { data: services, error: svcError }] = await Promise.all([
    supabase.from("jobs").select("homeworks_id").not("homeworks_id", "is", null),
    supabase.from("properties").select("homeworks_id").not("homeworks_id", "is", null),
    supabase.from("services").select("id, name"),
  ]);
  if (jobsError) return { ok: false as const, message: `Couldn't read existing Jarvis jobs: ${jobsError.message}` };
  if (propsError) return { ok: false as const, message: `Couldn't read existing Jarvis properties: ${propsError.message}` };
  if (svcError) return { ok: false as const, message: `Couldn't read existing Jarvis services: ${svcError.message}` };

  const plan = planHistoricalSync({
    events: fetched.events as unknown as HistoricalEvent[],
    existingJobHwIds: new Set((jobs ?? []).map((j) => String(j.homeworks_id))),
    linkedPropertyHwIds: new Set((properties ?? []).map((p) => String(p.homeworks_id))),
    existingServiceNames: (services ?? []).map((s) => s.name),
  });
  return { ok: true as const, plan, meta: fetched.meta, supabase, services: services ?? [] };
}

export type HistoricalPreviewResult = { ok: true; plan: HistoricalPlan; meta: EventFetchMeta } | { ok: false; message: string };

/** Entirely read-only. */
export async function previewHistoricalSync(range: DateRange): Promise<HistoricalPreviewResult> {
  const built = await buildPlan(range);
  if (!built.ok) return built;
  return { ok: true, plan: built.plan, meta: built.meta };
}

export type HistoricalConfirmRow = { hwId: string; customer: string; outcome: "created" | "skipped" | "error"; detail: string };
export type HistoricalConfirmResult =
  | { ok: true; created: number; servicesCreated: number; skipped: number; errors: number; rows: HistoricalConfirmRow[] }
  | { ok: false; message: string };

/** Retired: automatic sync owns the Homeworks projections. Performs no I/O. */
export async function confirmHistoricalSync(_range: DateRange): Promise<HistoricalConfirmResult> {
  void _range; // Keep the retired action signature compatible with stale callers.
  return { ok: false, message: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
