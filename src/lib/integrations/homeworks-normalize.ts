import type { HomeworksCustomerSample, HomeworksUpcomingJob } from "@/lib/integrations/homeworks-api";

/** Homeworks IDs are JSON numbers on the wire (SafeInt); Jarvis stores them as text. */
export function idString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeCustomer(raw: HomeworksCustomerSample): HomeworksCustomerSample {
  return {
    ...raw,
    rawIdType: typeof raw.id,
    id: idString(raw.id),
    number: idString(raw.number),
    properties: (raw.properties ?? []).map((p) => ({ ...p, id: idString(p.id) })),
  };
}

export function normalizeJob(raw: HomeworksUpcomingJob): HomeworksUpcomingJob {
  return {
    ...raw,
    id: idString(raw.id),
    recurringEventId: raw.recurringEventId === null || raw.recurringEventId === undefined ? null : idString(raw.recurringEventId),
    customer: raw.customer ? { ...raw.customer, id: idString(raw.customer.id) } : null,
    property: raw.property ? { ...raw.property, id: idString(raw.property.id) } : null,
  };
}
