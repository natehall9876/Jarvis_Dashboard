/**
 * Pure planning logic for enriching EXISTING Jarvis jobs from Homeworks event
 * detail (service name, budgeted hours, real start time).
 *
 * Rules, all enforced here rather than left to the UI:
 *  - Existing jobs are matched by canonical Homeworks event ID only and are
 *    updated in place; enrichment never creates a job.
 *  - It only FILLS blanks. A non-blank Jarvis value (something the owner may
 *    have entered) is never replaced — a difference is reported as "left
 *    unchanged", not written.
 *  - A missing or zero Homeworks value never overwrites anything.
 *  - A start time is only ever taken when Homeworks says the event has one
 *    (hasTime). All-day events never get an invented time.
 *  - The event TITLE is not a service name (it is often "<Customer> Grass"); the
 *    service name comes from the first line item.
 */
export type EnrichEvent = {
  id: string;
  status: string;
  isDeleted?: boolean;
  startDate: string;
  hasTime: boolean;
  startTime: string | null;
  budgetedHours?: string | null;
  lineItems?: { name: string; description: string | null; budgetedHours?: string | null }[];
  customer?: { fullName: string } | null;
  property?: { address: { street1: string; city: string | null } | null } | null;
};

export type EnrichJob = {
  id: string;
  homeworks_id: string | null;
  service_id: string | null;
  service_name: string | null;
  budgeted_hours: number | null;
  scheduled_start_time: string | null;
  scheduled_date: string | null;
  clientName: string;
  propertyLabel: string;
};

export type EnrichField = "service" | "budgeted_hours" | "scheduled_start_time";
export type EnrichChange = { field: EnrichField; before: string | null; after: string };
export type EnrichKept = { field: EnrichField; jarvis: string; homeworks: string };

export type EnrichRow = {
  jobId: string;
  hwId: string;
  customer: string;
  property: string;
  date: string | null;
  status: "update" | "unchanged" | "review";
  changes: EnrichChange[];
  kept: EnrichKept[];
  reason: string;
  /** Service name that will be created because no Jarvis service has it. */
  newServiceName: string | null;
  /** The resolved values a confirm would write, so confirm re-derives the same thing. */
  resolved: { serviceName: string | null; serviceDescription: string | null; hours: number | null; startTime: string | null };
};

export type EnrichPlan = {
  rows: EnrichRow[];
  servicesToCreate: { name: string; description: string | null }[];
  totals: { events: number; matchedJobs: number; update: number; unchanged: number; review: number; notInJarvis: number; fieldsToFill: number };
};

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function normalizeServiceName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function serviceFromEvent(e: EnrichEvent): { name: string; description: string | null } | null {
  const item = (e.lineItems ?? []).find((li) => li.name && li.name.trim());
  if (!item) return null;
  const description = htmlToText(item.description);
  return { name: item.name.trim().replace(/\s+/g, " "), description: description || null };
}

/** Budgeted hours from the event, else the sum of its line items. Zero or unparseable means "not provided". */
export function hoursFromEvent(e: EnrichEvent): number | null {
  const own = Number(e.budgetedHours);
  if (Number.isFinite(own) && own > 0) return own;
  const sum = (e.lineItems ?? []).reduce((s, li) => s + (Number(li.budgetedHours) > 0 ? Number(li.budgetedHours) : 0), 0);
  return sum > 0 ? sum : null;
}

function hhmm(t: string | null | undefined): string | null {
  const m = t ? /^(\d{1,2}):(\d{2})/.exec(t) : null;
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

const fmtHours = (h: number) => `${Number(h.toFixed(2))} hr`;

export function planEnrichment(input: { events: EnrichEvent[]; jobs: EnrichJob[]; existingServiceNames: string[] }): EnrichPlan {
  const jobByHw = new Map<string, EnrichJob>();
  for (const j of input.jobs) if (j.homeworks_id) jobByHw.set(String(j.homeworks_id), j);
  const known = new Set(input.existingServiceNames.map(normalizeServiceName));

  const rows: EnrichRow[] = [];
  const toCreate = new Map<string, { name: string; description: string | null }>();
  let notInJarvis = 0;

  for (const e of input.events) {
    const job = jobByHw.get(String(e.id));
    if (!job) {
      notInJarvis++;
      continue;
    }
    const svc = serviceFromEvent(e);
    const hours = hoursFromEvent(e);
    const startTime = e.hasTime ? hhmm(e.startTime) : null;
    const base = {
      jobId: job.id,
      hwId: String(e.id),
      customer: job.clientName,
      property: job.propertyLabel,
      date: job.scheduled_date,
      resolved: { serviceName: svc?.name ?? null, serviceDescription: svc?.description ?? null, hours, startTime },
    };

    if (e.isDeleted) {
      rows.push({ ...base, status: "review", changes: [], kept: [], reason: "Deleted in Homeworks — nothing was changed.", newServiceName: null });
      continue;
    }

    const changes: EnrichChange[] = [];
    const kept: EnrichKept[] = [];
    let newServiceName: string | null = null;

    if (svc) {
      if (!job.service_id) {
        changes.push({ field: "service", before: null, after: svc.name });
        if (!known.has(normalizeServiceName(svc.name))) {
          newServiceName = svc.name;
          if (!toCreate.has(normalizeServiceName(svc.name))) toCreate.set(normalizeServiceName(svc.name), { name: svc.name, description: svc.description });
        }
      } else if (job.service_name && normalizeServiceName(job.service_name) !== normalizeServiceName(svc.name)) {
        kept.push({ field: "service", jarvis: job.service_name, homeworks: svc.name });
      }
    }

    if (hours !== null) {
      if (job.budgeted_hours == null || job.budgeted_hours <= 0) changes.push({ field: "budgeted_hours", before: null, after: fmtHours(hours) });
      else if (Math.abs(job.budgeted_hours - hours) > 0.001) kept.push({ field: "budgeted_hours", jarvis: fmtHours(job.budgeted_hours), homeworks: fmtHours(hours) });
    }

    if (startTime) {
      const current = hhmm(job.scheduled_start_time);
      if (!job.scheduled_start_time) changes.push({ field: "scheduled_start_time", before: null, after: startTime });
      else if (current !== startTime) kept.push({ field: "scheduled_start_time", jarvis: current ?? job.scheduled_start_time, homeworks: startTime });
    }

    if (changes.length > 0) {
      rows.push({ ...base, status: "update", changes, kept, reason: "Fills blank fields from Homeworks.", newServiceName });
    } else if (!job.service_id && !svc) {
      rows.push({ ...base, status: "review", changes: [], kept, reason: "Homeworks has no line-item service name for this event and Jarvis has no service set.", newServiceName: null });
    } else {
      rows.push({ ...base, status: "unchanged", changes: [], kept, reason: kept.length ? "Jarvis already has different values — left as they are." : "Already complete.", newServiceName: null });
    }
  }

  const count = (s: EnrichRow["status"]) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    servicesToCreate: [...toCreate.values()],
    totals: {
      events: input.events.length,
      matchedJobs: rows.length,
      update: count("update"),
      unchanged: count("unchanged"),
      review: count("review"),
      notInJarvis,
      fieldsToFill: rows.reduce((n, r) => n + r.changes.length, 0),
    },
  };
}
