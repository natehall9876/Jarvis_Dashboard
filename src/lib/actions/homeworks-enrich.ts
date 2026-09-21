"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsInRange, type EventFetchMeta } from "@/lib/integrations/homeworks-api";
import { logActivity } from "@/lib/data/activity-log";
import { normalizeServiceName, planEnrichment, type EnrichEvent, type EnrichJob, type EnrichPlan, type EnrichRow } from "@/lib/integrations/homeworks-enrich";
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

/**
 * The only write path for enrichment. Re-derives the whole plan from live data
 * (never trusts client state) and applies ONLY fills. Every write is guarded so
 * it can only land on a still-blank field — if the owner edited a job after the
 * preview, that write updates zero rows and is skipped. Never creates or
 * deletes jobs, never touches notes/price/status/photos, never changes an
 * external ID. Re-running after success finds nothing left to fill.
 */
export async function confirmHomeworksEnrichment(range: DateRange): Promise<EnrichConfirmResult> {
  const built = await buildPlan(range);
  if (!built.ok) return built;
  const { plan, supabase } = built;

  const serviceIdByName = new Map(built.services.map((s) => [normalizeServiceName(s.name), s.id]));
  let servicesCreated = 0;
  const details: (Extract<EnrichConfirmResult, { ok: true }>["details"][number])[] = [];
  let errors = 0;

  // Create only the services that genuinely don't exist (checked case-insensitively, just now).
  for (const svc of plan.servicesToCreate) {
    const key = normalizeServiceName(svc.name);
    if (serviceIdByName.has(key)) continue;
    const { data, error } = await supabase.from("services").insert({ name: svc.name, description: svc.description, active: true }).select("id").single();
    if (error || !data) {
      errors++;
      details.push({ hwId: "-", customer: `service "${svc.name}"`, outcome: "error", detail: error?.message ?? "Could not create service." });
      continue;
    }
    serviceIdByName.set(key, data.id);
    servicesCreated++;
  }

  let jobsUpdated = 0;
  let fieldsFilled = 0;
  for (const row of plan.rows.filter((r): r is EnrichRow => r.status === "update")) {
    let filled = 0;
    const notes: string[] = [];
    for (const change of row.changes) {
      let q;
      if (change.field === "service") {
        const serviceId = row.resolved.serviceName ? serviceIdByName.get(normalizeServiceName(row.resolved.serviceName)) : undefined;
        if (!serviceId) {
          notes.push("service unavailable");
          continue;
        }
        q = supabase.from("jobs").update({ service_id: serviceId }).eq("id", row.jobId).is("service_id", null);
      } else if (change.field === "budgeted_hours" && row.resolved.hours !== null) {
        q = supabase.from("jobs").update({ budgeted_hours: row.resolved.hours }).eq("id", row.jobId).or("budgeted_hours.is.null,budgeted_hours.lte.0");
      } else if (change.field === "scheduled_start_time" && row.resolved.startTime) {
        q = supabase.from("jobs").update({ scheduled_start_time: row.resolved.startTime }).eq("id", row.jobId).is("scheduled_start_time", null);
      } else continue;
      const { data, error } = await q.select("id");
      if (error) {
        errors++;
        notes.push(`${change.field}: ${error.message}`);
      } else if (!data || data.length === 0) notes.push(`${change.field} changed since preview — left alone`);
      else filled++;
    }
    if (filled > 0) {
      jobsUpdated++;
      fieldsFilled += filled;
      await logActivity({
        entityType: "job",
        entityId: row.jobId,
        eventType: "homeworks_enriched",
        summary: `Filled ${filled} blank field(s) from Homeworks event ${row.hwId}`,
        detail: { fields: row.changes.map((c) => c.field), homeworks_id: row.hwId },
        source: "owner",
      });
    }
    details.push({ hwId: row.hwId, customer: row.customer, outcome: filled > 0 ? "updated" : notes.length ? "error" : "skipped", detail: notes.length ? notes.join("; ") : `Filled ${filled} field(s)` });
  }

  revalidatePath("/schedule");
  revalidatePath("/jobs");
  revalidatePath("/");
  return { ok: true, jobsUpdated, fieldsFilled, servicesCreated, skipped: details.filter((d) => d.outcome === "skipped").length, errors, details };
}
