import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrNotFound, withDataResult } from "@/lib/data/shared";
import type {
  Client,
  ClientWithBalance,
  DataResult,
  Invoice,
  Job,
  Property,
  Quote,
} from "@/types/domain";

// homeworks_deleted is supplied by the deployed automatic-sync migration;
// use the column filter until the parallel task regenerates Database types.
export async function getClients(search?: string): Promise<DataResult<ClientWithBalance[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: allClients, error } = await supabase
      .from("clients")
      .select("*")
      .neq("data_source", "demo")
      .filter("homeworks_deleted", "eq", false)
      .order("first_name", { ascending: true });
    if (error) throw error;

    // Matched in JS against first+last+company+email combined, not per-column
    // SQL ILIKE — a per-column OR filter can never match a full-name query
    // like "Sarah Delgado" since first_name and last_name are separate
    // columns, neither of which contains the full two-word string.
    const term = search?.trim().toLowerCase();
    const clients = term
      ? (allClients ?? []).filter((c) => {
          const haystack = [c.first_name, c.last_name, c.company_name, c.email].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(term);
        })
      : allClients ?? [];

    if (clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);

    const [{ data: properties, error: propertiesError }, { data: invoices, error: invoicesError }] = await Promise.all([
      supabase.from("properties").select("id, client_id").filter("homeworks_deleted", "eq", false).in("client_id", clientIds),
      supabase
        .from("invoices")
        .select("client_id, total, amount_paid, status")
        .filter("homeworks_deleted", "eq", false)
        .in("client_id", clientIds)
        .neq("status", "draft")
        .neq("status", "void"),
    ]);

    if (propertiesError) throw propertiesError;
    if (invoicesError) throw invoicesError;

    const propertyCountByClient = new Map<string, number>();
    for (const p of properties ?? []) {
      if (!p.client_id) continue;
      propertyCountByClient.set(p.client_id, (propertyCountByClient.get(p.client_id) ?? 0) + 1);
    }

    const balanceByClient = new Map<string, number>();
    const hasAnyInvoiceByClient = new Set<string>();
    for (const inv of invoices ?? []) {
      const balance = inv.total - inv.amount_paid;
      balanceByClient.set(inv.client_id, (balanceByClient.get(inv.client_id) ?? 0) + balance);
      hasAnyInvoiceByClient.add(inv.client_id);
    }

    return clients.map((client): ClientWithBalance => ({
      ...client,
      properties_count: propertyCountByClient.get(client.id) ?? 0,
      outstanding_balance: balanceByClient.get(client.id) ?? 0,
      // A homeworks_sync client with zero Jarvis invoice rows has an
      // unknown real balance, not a verified $0 — no invoice history for
      // this customer is recorded, so that $0 is an artifact of nothing to sum,
      // not evidence the customer is paid up. Any other data_source (or a
      // homeworks_sync client that does have at least one real invoice
      // row already) keeps the computed figure as genuinely verified.
      balance_verified: client.data_source !== "homeworks_sync" || hasAnyInvoiceByClient.has(client.id),
    }));
  });
}

export type ClientDetail = {
  client: Client;
  properties: Property[];
  jobs: Job[];
  quotes: Quote[];
  invoices: Invoice[];
  outstanding_balance: number;
  /** See ClientWithBalance.balance_verified — same reasoning, computed the same way. */
  balance_verified: boolean;
};

export async function getClientById(id: string): Promise<DataResult<ClientDetail | null>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const client = await getOrNotFound<Client>(supabase.from("clients").select("*").filter("homeworks_deleted", "eq", false).eq("id", id).maybeSingle());
    if (!client) return null;

    const { data: properties, error: propertiesError } = await supabase
      .from("properties")
      .select("*")
      .eq("client_id", id)
      .filter("homeworks_deleted", "eq", false)
      .order("street");

    if (propertiesError) throw propertiesError;
    const propertyIds = (properties ?? []).map((p) => p.id);

    const [{ data: jobs, error: jobsError }, { data: quotes, error: quotesError }, { data: invoices, error: invoicesError }] = await Promise.all([
      propertyIds.length
        ? supabase
            .from("jobs")
            .select("*")
            .filter("homeworks_deleted", "eq", false)
            .in("property_id", propertyIds)
            .order("scheduled_date", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Job[], error: null }),
      supabase.from("quotes").select("*").filter("homeworks_deleted", "eq", false).eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").filter("homeworks_deleted", "eq", false).eq("client_id", id).order("invoice_date", { ascending: false }),
    ]);

    if (jobsError) throw jobsError;
    if (quotesError) throw quotesError;
    if (invoicesError) throw invoicesError;
    const outstandingBalance = (invoices ?? [])
      .filter((inv) => inv.status !== "draft" && inv.status !== "void")
      .reduce((sum, inv) => sum + (inv.total - inv.amount_paid), 0);

    return {
      client,
      properties: properties ?? [],
      jobs: jobs ?? [],
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      outstanding_balance: outstandingBalance,
      balance_verified: client.data_source !== "homeworks_sync" || (invoices ?? []).length > 0,
    };
  });
}
