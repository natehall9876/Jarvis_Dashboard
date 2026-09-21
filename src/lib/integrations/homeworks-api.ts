import { getValidAccessToken } from "@/lib/integrations/homeworks-connection";
import { HOMEWORKS_GRAPHQL_ENDPOINT } from "@/lib/integrations/homeworks-oauth";
import { normalizeCustomer, normalizeJob } from "@/lib/integrations/homeworks-normalize";
import { fetchAllPages, type PageFetch } from "@/lib/integrations/homeworks-paging";
import { rangeForDays, validateRange } from "@/lib/integrations/homeworks-dates";

type GraphQLResult<T> = { ok: true; data: T } | { ok: false; message: string; retryable?: boolean };

async function queryHomeworks<T>(query: string, variables?: Record<string, unknown>): Promise<GraphQLResult<T>> {
  const token = await getValidAccessToken();
  if (!token.ok) return { ok: false, message: token.message };

  let response: Response;
  try {
    response = await fetch(HOMEWORKS_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token.accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach the Homeworks API.", retryable: true };
  }

  if (!response.ok) {
    const text = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    return { ok: false, message: `Homeworks API returned ${response.status}: ${text.slice(0, 400)}`, retryable };
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors && json.errors.length > 0) {
    return { ok: false, message: json.errors.map((e) => e.message).join("; ") };
  }
  if (!json.data) return { ok: false, message: "Homeworks API returned no data." };
  return { ok: true, data: json.data };
}

/**
 * Field names and argument signatures below are taken directly from the
 * live schema at https://api.home.works/graphql/schema.graphql (fetched
 * and verified 2026-09-18), not guessed — e.g. `customers(take: Int)`,
 * `Customer.fullName`, `Property.customerId` all match that schema
 * verbatim.
 */
export type HomeworksCustomerSample = {
  /**
   * Always a string in this app. Homeworks' GraphQL returns Customer.id
   * (SafeInt!) as a JSON NUMBER; Jarvis stores homeworks_id as text. Comparing
   * the two with === / Map / Set silently never matches, so every ID is
   * normalized with String() at the adapter boundary (see normalizeCustomer).
   */
  id: string;
  /** typeof the id exactly as the API returned it, before normalization — diagnostic only. */
  rawIdType?: string;
  /** Homeworks' human-facing customer number (Customer.number) — not the canonical ID. */
  number?: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cell: string;
  status: string;
  address: { street1: string; street2: string; city: string | null; state: string | null; zip: string } | null;
  properties: { id: string; name: string; address: { street1: string; city: string | null; state: string | null; zip: string } | null }[];
};

const CUSTOMERS_QUERY = `
  query FetchCustomers($take: SafeInt, $skip: SafeInt) {
    customers(take: $take, skip: $skip, where: { isDeleted: false }) {
      id
      number
      fullName
      firstName
      lastName
      email
      phone
      cell
      status
      address { street1 street2 city state zip }
      properties {
        id
        name
        address { street1 city state zip }
      }
    }
  }
`;

/** Read-only. Never writes anything. Used to verify the connection actually works and to preview real data before any sync is built. */
export async function getSampleCustomers(take = 5): Promise<GraphQLResult<{ customers: HomeworksCustomerSample[] }>> {
  const result = await queryHomeworks<{ customers: HomeworksCustomerSample[] }>(CUSTOMERS_QUERY, { take });
  if (!result.ok) return result;
  return { ok: true, data: { customers: result.data.customers.map(normalizeCustomer) } };
}

/**
 * Paginated fetch of every accessible customer — the `customers(skip, take)`
 * signature is exactly what the live schema declares (verified 2026-09-18,
 * not assumed), so pagination here means looping skip/take until a page
 * comes back shorter than the page size, the standard offset-pagination
 * pattern for a schema with no cursor/connection type. Read-only; this
 * never writes to Homeworks or Supabase — it's the data-gathering step a
 * preview or import is built on top of.
 *
 * A page size of 200 keeps each request well under any reasonable payload/
 * timeout limit while still finishing a several-hundred-customer account in
 * a handful of round trips. Hard-capped at 20 pages (4,000 customers) as a
 * runaway-loop guard, not an expected ceiling for a lawn care business.
 */
export async function getAllCustomers(): Promise<GraphQLResult<{ customers: HomeworksCustomerSample[]; pageCount: number; hitCap: boolean }>> {
  const pageSize = 200;
  const maxPages = 20;
  const all: HomeworksCustomerSample[] = [];
  let page = 0;

  while (page < maxPages) {
    const result = await queryHomeworks<{ customers: HomeworksCustomerSample[] }>(CUSTOMERS_QUERY, {
      take: pageSize,
      skip: page * pageSize,
    });
    if (!result.ok) return result;
    all.push(...result.data.customers.map(normalizeCustomer));
    page++;
    if (result.data.customers.length < pageSize) {
      return { ok: true, data: { customers: all, pageCount: page, hitCap: false } };
    }
  }
  return { ok: true, data: { customers: all, pageCount: page, hitCap: true } };
}

export type HomeworksUpcomingJob = {
  id: string;
  title: string;
  status: string;
  startDate: string;
  hasTime: boolean;
  startTime: string | null;
  total: string;
  /** Non-null means this event is part of a recurring series — there is no separate isRecurring field on Event (verified against the live schema, not assumed). */
  recurringEventId: string | null;
  customer: { id: string; fullName: string } | null;
  property: { id: string; name: string; address: { street1: string; city: string | null; state: string | null } | null } | null;
  /** Present on events fetched by getEventsInRange / getEventsByIds. */
  isDeleted?: boolean;
  endDate?: string | null;
};

/**
 * Read-only. `days` counts from TODAY IN THE BUSINESS TIMEZONE (America/New_York),
 * inclusive of both ends, fetched with real pagination. Returns only OPEN
 * (scheduled) events; use getEventsInRange for every status.
 */
export async function getUpcomingJobs(days = 7): Promise<GraphQLResult<{ jobs: HomeworksUpcomingJob[]; meta: EventFetchMeta }>> {
  const result = await getEventsInRange(rangeForDays(days));
  if (!result.ok) return result;
  return { ok: true, data: { jobs: result.data.events.filter((e) => e.status === "OPEN"), meta: result.data.meta } };
}

const EVENT_RANGE_FIELDS = `
  id title status isDeleted startDate endDate hasTime startTime total recurringEventId
  customer { id fullName }
  property { id name address { street1 city state } }
`;

const EVENTS_IN_RANGE_QUERY = `
  query EventsInRange($from: Date!, $to: Date!, $take: SafeInt!, $skip: SafeInt!) {
    events(
      where: { startDate: { gte: $from, lte: $to }, isDeleted: false }
      orderBy: [{ startDate: asc }, { id: asc }]
      take: $take
      skip: $skip
    ) { ${EVENT_RANGE_FIELDS} }
  }
`;

// Multi-day events that started before the range but are still running into it.
const EVENTS_SPANNING_QUERY = `
  query EventsSpanning($from: Date!, $take: SafeInt!, $skip: SafeInt!) {
    events(
      where: { startDate: { lt: $from }, endDate: { gte: $from }, isDeleted: false }
      orderBy: [{ startDate: asc }, { id: asc }]
      take: $take
      skip: $skip
    ) { ${EVENT_RANGE_FIELDS} }
  }
`;

const EVENTS_BY_IDS_QUERY = `
  query EventsByIds($ids: [SafeInt!]!, $take: SafeInt!) {
    events(where: { id: { in: $ids } }, take: $take) { ${EVENT_RANGE_FIELDS} }
  }
`;

export type EventFetchMeta = {
  pageSize: number;
  pages: number;
  /** Rows returned by the API across all pages, before de-duplication. */
  rawCount: number;
  duplicates: number;
  range: { from: string; to: string };
};

export type EventsInRange = { events: HomeworksUpcomingJob[]; meta: EventFetchMeta };

/**
 * Every event (all statuses, soft-deleted excluded) whose start date falls in
 * the inclusive [from, to] calendar range, plus multi-day events still running
 * into it. Pages with take/skip until a short page, de-duplicates by canonical
 * event ID, retries 429/5xx, and REFUSES to return a partial list as complete.
 * Dates are business-local calendar dates (see homeworks-dates.ts) — no UTC math.
 */
export async function getEventsInRange(range: { from: string; to: string }): Promise<GraphQLResult<EventsInRange>> {
  const validation = validateRange(range);
  if (!validation.ok) return { ok: false, message: validation.message };

  const page = (query: string, vars: Record<string, unknown>): PageFetch<HomeworksUpcomingJob> => async (skip, take) => {
    const result = await queryHomeworks<{ events: HomeworksUpcomingJob[] }>(query, { ...vars, take, skip });
    if (!result.ok) return { ok: false, message: result.message, retryable: result.retryable };
    return { ok: true, items: result.data.events.map(normalizeJob) };
  };

  const main = await fetchAllPages(page(EVENTS_IN_RANGE_QUERY, { from: range.from, to: range.to }), { pageSize: 200 });
  if (!main.ok) return { ok: false, message: `${main.message} (${main.partial.items.length} events fetched before the failure — none will be used.)` };
  const spanning = await fetchAllPages(page(EVENTS_SPANNING_QUERY, { from: range.from }), { pageSize: 200 });
  if (!spanning.ok) return { ok: false, message: `${spanning.message} (multi-day events query.)` };

  const byId = new Map<string, HomeworksUpcomingJob>();
  for (const e of [...main.items, ...spanning.items]) byId.set(e.id, e);
  return {
    ok: true,
    data: {
      events: [...byId.values()],
      meta: {
        pageSize: main.pageSize,
        pages: main.pages + spanning.pages,
        rawCount: main.rawCount + spanning.rawCount,
        duplicates: main.duplicates + spanning.duplicates + (main.items.length + spanning.items.length - byId.size),
        range,
      },
    },
  };
}

/** Looks up specific events by canonical ID regardless of date/status (deleted ones included via isDeleted in the row). */
export async function getEventsByIds(ids: string[]): Promise<GraphQLResult<{ events: HomeworksUpcomingJob[] }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const found: HomeworksUpcomingJob[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200).map(Number).filter((n) => Number.isSafeInteger(n));
    const result = await queryHomeworks<{ events: HomeworksUpcomingJob[] }>(EVENTS_BY_IDS_QUERY, { ids: chunk, take: chunk.length });
    if (!result.ok) return result;
    found.push(...result.data.events.map(normalizeJob));
  }
  return { ok: true, data: { events: found } };
}

const WHO_AM_I_QUERY = `
  query WhoAmI {
    currentUser {
      id
      email
      company { id name }
    }
  }
`;

export type HomeworksAccount = { userEmail: string; companyName: string };

/** Read-only. Shows which real Homeworks account/company the connection is authorized against — not just "Connected", an actual identity check. */
export async function getConnectedAccount(): Promise<GraphQLResult<HomeworksAccount>> {
  const result = await queryHomeworks<{ currentUser: { email: string; company: { name: string } | null } }>(WHO_AM_I_QUERY);
  if (!result.ok) return result;
  return { ok: true, data: { userEmail: result.data.currentUser.email, companyName: result.data.currentUser.company?.name ?? "(unknown company)" } };
}
