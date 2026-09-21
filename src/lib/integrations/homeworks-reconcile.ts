/**
 * Read-only comparison of one calendar day between Homeworks and Jarvis, keyed
 * strictly on the canonical Homeworks event ID (never on customer name or
 * address). Every Homeworks event is either matched or explained; every Jarvis
 * job on that day is either matched or explained.
 */
export type ReconEvent = {
  id: string;
  title: string;
  status: string;
  isDeleted?: boolean;
  startDate: string;
  endDate?: string | null;
  hasTime: boolean;
  startTime: string | null;
  customer: { fullName: string } | null;
  property: { id: string; address: { street1: string; city: string | null } | null } | null;
};

export type ReconJarvisJob = {
  id: string;
  homeworks_id: string | null;
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  status: string;
  clientName: string;
  propertyLabel: string;
};

export type ReconRow = {
  state: "matched" | "missing" | "extra";
  hwId: string | null;
  jarvisJobId: string | null;
  customer: string;
  property: string;
  localDate: string;
  localTime: string;
  hwStatus: string | null;
  jarvisStatus: string | null;
  reason: string;
};

export type ReconResult = {
  date: string;
  totals: { homeworks: number; jarvis: number; matched: number; missing: number; extra: number };
  rows: ReconRow[];
};

const UNSCHEDULED = "Unscheduled time (all-day)";

function hhmm(value: string | null | undefined): string | null {
  const m = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function addr(e: ReconEvent): string {
  const a = e.property?.address;
  return a ? [a.street1, a.city].filter(Boolean).join(", ") : "(no property)";
}

export function reconcileDay(input: {
  date: string;
  hwEvents: ReconEvent[];
  jarvisJobsOnDate: ReconJarvisJob[];
  /** Jarvis jobs found by homeworks_id for the day's Homeworks events (any date). */
  jarvisJobsByHwId: Map<string, ReconJarvisJob>;
  /** Homeworks property IDs that some Jarvis property is linked to. */
  linkedPropertyHwIds: Set<string>;
  /** Homeworks' own view of Jarvis-side extras, looked up by ID. */
  hwLookup: Map<string, ReconEvent>;
}): ReconResult {
  const { date } = input;
  const rows: ReconRow[] = [];
  const dayEvents = input.hwEvents.filter((e) => e.startDate === date || (e.startDate < date && !!e.endDate && e.endDate >= date));
  const dayIds = new Set(dayEvents.map((e) => e.id));

  for (const e of dayEvents) {
    const base = {
      hwId: e.id,
      customer: e.customer?.fullName ?? "(no customer)",
      property: addr(e),
      localDate: e.startDate,
      localTime: e.hasTime && e.startTime ? (hhmm(e.startTime) ?? e.startTime) : UNSCHEDULED,
      hwStatus: e.status,
    };
    const jarvis = input.jarvisJobsByHwId.get(e.id);
    if (jarvis && jarvis.scheduled_date === date) {
      rows.push({ ...base, state: "matched", jarvisJobId: jarvis.id, jarvisStatus: jarvis.status, reason: "Same Homeworks event ID on the same date." });
      continue;
    }
    let reason: string;
    if (jarvis) reason = `Jarvis has this event ID but on ${jarvis.scheduled_date ?? "no date"} — the dates differ.`;
    else if (e.isDeleted) reason = "Deleted in Homeworks.";
    else if (e.status !== "OPEN") reason = `Not imported by design: Homeworks status is ${e.status} (only OPEN jobs sync).`;
    else if (!e.property) reason = "The Homeworks event has no property, so it cannot be attached to a Jarvis property.";
    else if (!input.linkedPropertyHwIds.has(e.property.id)) reason = `Blocked: no Jarvis property is linked to Homeworks property ${e.property.id}.`;
    else reason = "Not imported yet — the event exists in Homeworks but this Jarvis database has no job with its ID. Run the job sync for this date.";
    rows.push({ ...base, state: "missing", jarvisJobId: jarvis?.id ?? null, jarvisStatus: jarvis?.status ?? null, reason });
  }

  for (const j of input.jarvisJobsOnDate) {
    if (j.homeworks_id && dayIds.has(j.homeworks_id)) continue;
    const base = {
      hwId: j.homeworks_id,
      jarvisJobId: j.id,
      customer: j.clientName,
      property: j.propertyLabel,
      localDate: j.scheduled_date ?? date,
      localTime: hhmm(j.scheduled_start_time) ?? UNSCHEDULED,
      hwStatus: null as string | null,
      jarvisStatus: j.status,
    };
    if (!j.homeworks_id) {
      rows.push({ ...base, state: "extra", reason: "Jarvis-only job (no Homeworks ID) — created manually or by another source." });
      continue;
    }
    const hw = input.hwLookup.get(j.homeworks_id);
    let reason: string;
    if (!hw) reason = "Homeworks no longer returns this event ID (deleted or not visible to this connection).";
    else if (hw.isDeleted) reason = "Deleted in Homeworks.";
    else if (hw.status !== "OPEN") reason = `Homeworks status is now ${hw.status}.`;
    else if (hw.startDate !== date) reason = `Homeworks now lists this event on ${hw.startDate}.`;
    else reason = "Homeworks lists this event on this date but the day query did not return it — investigate.";
    rows.push({ ...base, state: "extra", hwStatus: hw?.status ?? null, reason });
  }

  const count = (s: ReconRow["state"]) => rows.filter((r) => r.state === s).length;
  return {
    date,
    totals: { homeworks: dayEvents.length, jarvis: input.jarvisJobsOnDate.length, matched: count("matched"), missing: count("missing"), extra: count("extra") },
    rows,
  };
}
