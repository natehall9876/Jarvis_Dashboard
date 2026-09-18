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

const SAMPLE_CUSTOMERS_QUERY = `
  query SampleCustomers($take: SafeInt) {
    customers(take: $take, where: { isDeleted: false }) {
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
  return queryHomeworks<{ customers: HomeworksCustomerSample[] }>(SAMPLE_CUSTOMERS_QUERY, { take });
}
