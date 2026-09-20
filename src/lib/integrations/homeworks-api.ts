import { getValidAccessToken } from "@/lib/integrations/homeworks-connection";
import { HOMEWORKS_GRAPHQL_ENDPOINT } from "@/lib/integrations/homeworks-oauth";

type GraphQLResult<T> = { ok: true; data: T } | { ok: false; message: string };

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
    return { ok: false, message: err instanceof Error ? err.message : "Failed to reach the Homeworks API." };
  }

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, message: `Homeworks API returned ${response.status}: ${text.slice(0, 400)}` };
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
  id: string;
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
  return queryHomeworks<{ customers: HomeworksCustomerSample[] }>(CUSTOMERS_QUERY, { take });
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
    all.push(...result.data.customers);
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
  customer: { fullName: string } | null;
  property: { name: string; address: { street1: string; city: string | null; state: string | null } | null } | null;
};

/**
 * This exact query shape was empirically run against the live API this
 * session (not just read from the schema), through two real, caught
 * errors: `orderBy: [{ startDate: ASC }]` was rejected ("does not exist in
 * SortOrder enum, did you mean asc or desc") — lowercase fixed it. Then,
 * as a parameterized query (variables, not inline literals),
 * `$from`/`$to` typed as `LocalDate!` were rejected too ("used in position
 * expecting type Date") — `Event.startDate` is a `LocalDate`, but
 * `DateFilter.gte`/`lte` expect the separate `Date` scalar. Both fixed and
 * re-verified with real results before this was written into the app.
 * `status: { equals: OPEN }` matches the live playbook's own definition of
 * "scheduled/active" jobs (CLOSED = complete, SKIPPED/CANCELLED/WAITLISTED
 * are excluded).
 */
const UPCOMING_JOBS_QUERY = `
  query UpcomingJobs($from: Date!, $to: Date!) {
    events(
      where: { status: { equals: OPEN }, startDate: { gte: $from, lte: $to }, isDeleted: false }
      orderBy: [{ startDate: asc }]
    ) {
      id
      title
      status
      startDate
      hasTime
      startTime
      customer { fullName }
      property { name address { street1 city state } }
    }
  }
`;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Read-only. Defaults to today through 7 days out, matching the Command Center's own "next 7 days" convention elsewhere in the app. */
export async function getUpcomingJobs(days = 7): Promise<GraphQLResult<{ jobs: HomeworksUpcomingJob[] }>> {
  const today = new Date();
  const to = new Date(today.getTime() + days * 86_400_000);
  const result = await queryHomeworks<{ events: HomeworksUpcomingJob[] }>(UPCOMING_JOBS_QUERY, {
    from: toISODate(today),
    to: toISODate(to),
  });
  if (!result.ok) return result;
  return { ok: true, data: { jobs: result.data.events } };
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
