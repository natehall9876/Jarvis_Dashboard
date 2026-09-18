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
