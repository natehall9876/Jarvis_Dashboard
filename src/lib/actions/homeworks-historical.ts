"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsInRange, type EventFetchMeta, type HomeworksUpcomingJob } from "@/lib/integrations/homeworks-api";
import { normalizeServiceName } from "@/lib/integrations/homeworks-enrich";
import { planHistoricalSync, type HistoricalEvent, type HistoricalPlan } from "@/lib/integrations/homeworks-historical";
import { logActivity } from "@/lib/data/activity-log";
import { validateRange, type DateRange } from "@/lib/integrations/homeworks-dates";

/**
 * The historical (completed-work) sync. Entirely separate from the active job
 * sync in homeworks-job-sync.ts — different query (every status, not just
 * OPEN), different write path (plain guarded INSERT, never an upsert that
 * could touch an existing row), different UI section. Nothing here can alter
 * a job the active sync created, and nothing the active sync does changes.
 */

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

/**
 * The only write path. Every insert is guarded twice: the plan already
 * excludes any event Jarvis has a job for, and jobs.homeworks_id carries a
 * real unique constraint — so even a race (two tabs confirming at once, or a
 * job created by the active sync between preview and confirm) fails the
 * insert instead of duplicating a row, and that failure is reported as
 * "skipped", not silently swallowed or retried into a second row.
 */
export async function confirmHistoricalSync(range: DateRange): Promise<HistoricalConfirmResult> {
  const built = await buildPlan(range);
  if (!built.ok) return built;
  const { plan, supabase } = built;

  const serviceIdByName = new Map(built.services.map((s) => [normalizeServiceName(s.name), s.id]));
  let servicesCreated = 0;
  for (const svc of plan.servicesToCreate) {
    const key = normalizeServiceName(svc.name);
    if (serviceIdByName.has(key)) continue;
    const { data, error } = await supabase.from("services").insert({ name: svc.name, description: svc.description, active: true }).select("id").single();
    if (!error && data) {
      serviceIdByName.set(key, data.id);
      servicesCreated++;
    }
  }

  const { data: properties } = await supabase.from("properties").select("id, homeworks_id").not("homeworks_id", "is", null);
  const propertyIdByHw = new Map((properties ?? []).map((p) => [String(p.homeworks_id), p.id]));

  const rows: HistoricalConfirmRow[] = [];
  let created = 0;
  let errors = 0;

  // Re-fetch the raw events once more so property/customer linkage used for the
  // actual insert comes from the same live source the plan was built from.
  const fetched = await fetchDetail(range);
  if (!fetched.ok) return { ok: false, message: fetched.message };
  const eventById = new Map(fetched.events.map((e) => [e.id, e]));

  for (const row of plan.rows.filter((r) => r.status === "would_create")) {
    const event = eventById.get(row.hwId);
    const propertyHwId = event?.property?.id;
    const propertyId = propertyHwId ? propertyIdByHw.get(propertyHwId) : undefined;
    if (!propertyId) {
      rows.push({ hwId: row.hwId, customer: row.customer, outcome: "error", detail: "Property is no longer linked — skipped." });
      errors++;
      continue;
    }
    const serviceId = row.resolved.serviceName ? (serviceIdByName.get(normalizeServiceName(row.resolved.serviceName)) ?? null) : null;

    const { data: inserted, error } = await supabase
      .from("jobs")
      .insert({
        homeworks_id: row.hwId,
        property_id: propertyId,
        service_id: serviceId,
        scheduled_date: row.date,
        scheduled_start_time: row.resolved.startTime,
        price: row.resolved.price,
        budgeted_hours: row.resolved.hours,
        status: "completed",
        completed_at: row.resolved.completedAt,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // A unique-violation here means the job now exists (created since the plan was built) — that is duplicate prevention working, not a failure.
      const isDuplicate = error?.code === "23505";
      rows.push({ hwId: row.hwId, customer: row.customer, outcome: isDuplicate ? "skipped" : "error", detail: isDuplicate ? "Already exists — created since the preview." : (error?.message ?? "Insert failed.") });
      if (!isDuplicate) errors++;
      continue;
    }
    created++;
    rows.push({ hwId: row.hwId, customer: row.customer, outcome: "created", detail: `Completed ${row.date}${row.resolved.price !== null ? ` — $${row.resolved.price}` : ""}.` });
    await logActivity({
      entityType: "job",
      entityId: inserted.id,
      eventType: "historical_sync",
      summary: `Historical job added from Homeworks: ${row.customer}, completed ${row.date}`,
      detail: { homeworks_id: row.hwId, price: row.resolved.price },
      source: "owner",
    });
  }

  revalidatePath("/jobs");
  revalidatePath("/clients");
  revalidatePath("/properties");
  return { ok: true, created, servicesCreated, skipped: rows.filter((r) => r.outcome === "skipped").length, errors, rows };
}
