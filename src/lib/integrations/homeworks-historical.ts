/**
 * Pure planning for the historical (completed-work) sync. Entirely separate
 * from the active job sync (homeworks-job-sync.ts) and from the enrichment
 * planner it reuses helpers from (homeworks-enrich.ts) — this module ONLY
 * plans NEW rows for CLOSED Homeworks events that have no Jarvis job yet. It
 * never proposes touching a job Jarvis already has, whether that job came
 * from the active sync, a previous historical sync run, or the owner's own
 * hand — which is what makes duplicate prevention here unconditional rather
 * than a best-effort check: "already exists" is always a skip, never a
 * merge or overwrite candidate.
 */
import { hoursFromEvent, normalizeServiceName, serviceFromEvent, type EnrichEvent } from "@/lib/integrations/homeworks-enrich";

export type HistoricalEvent = {
  id: string;
  title: string;
  status: string;
  isDeleted?: boolean;
  startDate: string;
  hasTime: boolean;
  startTime: string | null;
  /** Event.total — the real quoted/invoiced amount, not an estimate. */
  total?: string | null;
  closedAt?: string | null;
  budgetedHours?: string | null;
  lineItems?: { name: string; description: string | null; budgetedHours?: string | null }[];
  customer?: { fullName: string } | null;
  property?: { id: string; address: { street1: string; city: string | null } | null } | null;
};

export type HistoricalRowStatus = "would_create" | "already_synced" | "blocked_property_not_synced" | "not_closed" | "deleted";

export type HistoricalPlanRow = {
  hwId: string;
  customer: string;
  property: string;
  date: string;
  status: HistoricalRowStatus;
  reason: string;
  resolved: { serviceName: string | null; serviceDescription: string | null; hours: number | null; price: number | null; completedAt: string | null; startTime: string | null };
};

export type HistoricalPlan = {
  rows: HistoricalPlanRow[];
  servicesToCreate: { name: string; description: string | null }[];
  totals: { events: number; wouldCreate: number; alreadySynced: number; blocked: number; other: number };
};

function hhmm(t: string | null | undefined): string | null {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

export function planHistoricalSync(input: {
  /** Every event fetched for the requested range, any status — the planner does its own CLOSED filtering so the caller's counts stay honest. */
  events: HistoricalEvent[];
  existingJobHwIds: Set<string>;
  linkedPropertyHwIds: Set<string>;
  existingServiceNames: string[];
}): HistoricalPlan {
  const known = new Set(input.existingServiceNames.map(normalizeServiceName));
  const toCreate = new Map<string, { name: string; description: string | null }>();
  const rows: HistoricalPlanRow[] = [];

  for (const e of input.events) {
    const price = e.total !== undefined && e.total !== null && Number.isFinite(Number(e.total)) ? Number(e.total) : null;
    const base = {
      hwId: e.id,
      customer: e.customer?.fullName ?? "(no customer)",
      property: e.property?.address ? [e.property.address.street1, e.property.address.city].filter(Boolean).join(", ") : "(no property)",
      date: e.startDate,
      resolved: { serviceName: null, serviceDescription: null, hours: null, price, completedAt: null, startTime: null },
    };

    if (e.status !== "CLOSED") {
      rows.push({ ...base, status: "not_closed", reason: `Status is ${e.status}, not CLOSED — not part of completed-work history.` });
      continue;
    }
    if (e.isDeleted) {
      rows.push({ ...base, status: "deleted", reason: "Deleted in Homeworks." });
      continue;
    }
    if (input.existingJobHwIds.has(e.id)) {
      rows.push({ ...base, status: "already_synced", reason: "Jarvis already has a job for this event ID — never re-created or overwritten." });
      continue;
    }
    if (!e.property || !input.linkedPropertyHwIds.has(e.property.id)) {
      rows.push({ ...base, status: "blocked_property_not_synced", reason: e.property ? `No Jarvis property is linked to Homeworks property ${e.property.id}.` : "This event has no property." });
      continue;
    }

    const svc = serviceFromEvent(e as unknown as EnrichEvent);
    if (svc && !known.has(normalizeServiceName(svc.name)) && !toCreate.has(normalizeServiceName(svc.name))) {
      toCreate.set(normalizeServiceName(svc.name), svc);
    }
    rows.push({
      ...base,
      status: "would_create",
      reason: "New completed-work record — will be added to service history.",
      resolved: {
        serviceName: svc?.name ?? null,
        serviceDescription: svc?.description ?? null,
        hours: hoursFromEvent(e as unknown as EnrichEvent),
        price,
        completedAt: e.closedAt ?? null,
        startTime: e.hasTime ? hhmm(e.startTime) : null,
      },
    });
  }

  const count = (s: HistoricalRowStatus) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    servicesToCreate: [...toCreate.values()],
    totals: {
      events: input.events.length,
      wouldCreate: count("would_create"),
      alreadySynced: count("already_synced"),
      blocked: count("blocked_property_not_synced"),
      other: count("not_closed") + count("deleted"),
    },
  };
}
