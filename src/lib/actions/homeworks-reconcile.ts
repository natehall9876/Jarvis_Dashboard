"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEventsByIds, getEventsInRange, type EventFetchMeta } from "@/lib/integrations/homeworks-api";
import { isISODate } from "@/lib/integrations/homeworks-dates";
import { reconcileDay, type ReconEvent, type ReconJarvisJob, type ReconResult } from "@/lib/integrations/homeworks-reconcile";

export type ReconcileActionResult = { ok: true; result: ReconResult; meta: EventFetchMeta; weekday: string } | { ok: false; message: string };

function clientNameOf(c: { first_name: string | null; last_name: string | null; company_name: string | null } | null | undefined): string {
  if (!c) return "(unknown client)";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "(unnamed client)";
}

type JobRow = {
  id: string;
  homeworks_id: string | null;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  status: string;
  property: { street: string | null; city: string | null; client: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null;
};

function toJarvisJob(j: JobRow): ReconJarvisJob {
  return {
    id: j.id,
    homeworks_id: j.homeworks_id,
    scheduled_date: j.scheduled_date,
    scheduled_start_time: j.scheduled_start_time,
    status: j.status,
    clientName: clientNameOf(j.property?.client),
    propertyLabel: [j.property?.street, j.property?.city].filter(Boolean).join(", ") || "(no address)",
  };
}

const JOB_SELECT = "id, homeworks_id, scheduled_date, scheduled_start_time, status, property:properties(street, city, client:clients(first_name, last_name, company_name))";

/**
 * Entirely read-only. Compares one calendar day in Homeworks against the same
 * day in Jarvis by canonical Homeworks event ID and explains every difference.
 * Requires a signed-in session (the Homeworks token lookup enforces it).
 */
export async function reconcileHomeworksDay(date: string): Promise<ReconcileActionResult> {
  if (!isISODate(date)) return { ok: false, message: "Date must be a valid YYYY-MM-DD value." };

  const hw = await getEventsInRange({ from: date, to: date });
  if (!hw.ok) return { ok: false, message: hw.message };

  const supabase = await createSupabaseServerClient();
  const hwIds = hw.data.events.map((e) => e.id);
  const [onDate, byId, props] = await Promise.all([
    supabase.from("jobs").select(JOB_SELECT).eq("scheduled_date", date),
    hwIds.length ? supabase.from("jobs").select(JOB_SELECT).in("homeworks_id", hwIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("properties").select("homeworks_id").not("homeworks_id", "is", null),
  ]);
  if (onDate.error) return { ok: false, message: `Couldn't read Jarvis jobs: ${onDate.error.message}` };
  if (byId.error) return { ok: false, message: `Couldn't read Jarvis jobs by Homeworks ID: ${byId.error.message}` };
  if (props.error) return { ok: false, message: `Couldn't read Jarvis properties: ${props.error.message}` };

  const jobsOnDate = ((onDate.data ?? []) as unknown as JobRow[]).map(toJarvisJob);
  const jobsByHwId = new Map<string, ReconJarvisJob>();
  for (const j of ((byId.data ?? []) as unknown as JobRow[]).map(toJarvisJob)) if (j.homeworks_id) jobsByHwId.set(j.homeworks_id, j);

  const dayIds = new Set(hwIds);
  const extraIds = jobsOnDate.map((j) => j.homeworks_id).filter((id): id is string => !!id && !dayIds.has(id));
  const lookup = new Map<string, ReconEvent>();
  if (extraIds.length) {
    const found = await getEventsByIds(extraIds);
    if (!found.ok) return { ok: false, message: found.message };
    for (const e of found.data.events) lookup.set(e.id, e as unknown as ReconEvent);
  }

  const result = reconcileDay({
    date,
    hwEvents: hw.data.events as unknown as ReconEvent[],
    jarvisJobsOnDate: jobsOnDate,
    jarvisJobsByHwId: jobsByHwId,
    linkedPropertyHwIds: new Set((props.data ?? []).map((p) => String(p.homeworks_id))),
    hwLookup: lookup,
  });
  const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return { ok: true, result, meta: hw.data.meta, weekday };
}
