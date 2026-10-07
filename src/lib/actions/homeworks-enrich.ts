"use server";

import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsInRange, type EventFetchMeta } from "@/lib/integrations/homeworks-api";
import { planEnrichment, type EnrichEvent, type EnrichJob, type EnrichPlan } from "@/lib/integrations/homeworks-enrich";
import type { DateRange } from "@/lib/integrations/homeworks-dates";

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type EnrichPreviewResult = { ok: true; plan: EnrichPlan; meta: EventFetchMeta } | { ok: false; message: string };

const JOB_SELECT =
  "id, homeworks_id, service_id, budgeted_hours, scheduled_start_time, scheduled_date, service:services(id, name), property:properties(street, city, client:clients(first_name, last_name, company_name))";

type JobRow = {
  id: string;
  homeworks_id: string | null;
  service_id: string | null;
  budgeted_hours: number | null;
  scheduled_start_time: string | null;
  scheduled_date: string | null;
  service: { id: string; name: string } | null;
  property: { street: string | null; city: string | null; client: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null;
};

function toEnrichJob(j: JobRow): EnrichJob {
  const c = j.property?.client;
  return {
    id: j.id,
    homeworks_id: j.homeworks_id,
    service_id: j.service_id,
    service_name: j.service?.name ?? null,
    budgeted_hours: j.budgeted_hours,
    scheduled_start_time: j.scheduled_start_time,
    scheduled_date: j.scheduled_date,
    clientName: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "(unnamed client)" : "(unknown client)",
    propertyLabel: [j.property?.street, j.property?.city].filter(Boolean).join(", ") || "(no address)",
  };
}

async function buildPlan(range: DateRange): Promise<{ ok: true; plan: EnrichPlan; meta: EventFetchMeta; supabase: Supa; services: { id: string; name: string }[] } | { ok: false; message: string }> {
  const hw = await getEventsInRange(range, { detail: true });
  if (!hw.ok) return { ok: false, message: hw.message };

  const supabase = await createSupabaseServerClient();
  const ids = hw.data.events.map((e) => e.id);
  const jobs: JobRow[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from("jobs").select(JOB_SELECT).in("homeworks_id", ids.slice(i, i + 100));
    if (error) return { ok: false, message: `Couldn't read Jarvis jobs: ${error.message}` };
    jobs.push(...((data ?? []) as unknown as JobRow[]));
  }
  const { data: services, error: svcError } = await supabase.from("services").select("id, name");
  if (svcError) return { ok: false, message: `Couldn't read Jarvis services: ${svcError.message}` };

  const plan = planEnrichment({
    events: hw.data.events as unknown as EnrichEvent[],
    jobs: jobs.map(toEnrichJob),
    existingServiceNames: (services ?? []).map((s) => s.name),
  });
  return { ok: true, plan, meta: hw.data.meta, supabase, services: services ?? [] };
}

/** Entirely read-only. */
export async function previewHomeworksEnrichment(range: DateRange): Promise<EnrichPreviewResult> {
  const built = await buildPlan(range);
  if (!built.ok) return built;
  return { ok: true, plan: built.plan, meta: built.meta };
}

export type EnrichConfirmResult =
  | { ok: true; jobsUpdated: number; fieldsFilled: number; servicesCreated: number; skipped: number; errors: number; details: { hwId: string; customer: string; outcome: "updated" | "skipped" | "error"; detail: string }[] }
  | { ok: false; message: string };

/** Retired: automatic sync owns the Homeworks projections. Performs no I/O. */
export async function confirmHomeworksEnrichment(_range: DateRange): Promise<EnrichConfirmResult> {
  void _range; // Keep the retired action signature compatible with stale callers.
  return { ok: false, message: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
