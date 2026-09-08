import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type {
  Client,
  ClientWithBalance,
  DataResult,
  Invoice,
  Job,
  Property,
  Quote,
} from "@/types/domain";

export async function getClients(search?: string): Promise<DataResult<ClientWithBalance[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    let query = supabase.from("clients").select("*").order("first_name", { ascending: true });
    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `first_name.ilike.${term},last_name.ilike.${term},company_name.ilike.${term},email.ilike.${term}`,
      );
    }

    const { data: clients, error } = await query;
    if (error) throw error;
    if (!clients || clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);

    const [{ data: properties }, { data: invoices }] = await Promise.all([
      supabase.from("properties").select("id, client_id").in("client_id", clientIds),
      supabase
        .from("invoices")
        .select("client_id, total, amount_paid, status")
        .in("client_id", clientIds)
        .neq("status", "draft"),
    ]);

    const propertyCountByClient = new Map<string, number>();
    for (const p of properties ?? []) {
      if (!p.client_id) continue;
      propertyCountByClient.set(p.client_id, (propertyCountByClient.get(p.client_id) ?? 0) + 1);
    }

    const balanceByClient = new Map<string, number>();
    for (const inv of invoices ?? []) {
      const balance = inv.total - inv.amount_paid;
      balanceByClient.set(inv.client_id, (balanceByClient.get(inv.client_id) ?? 0) + balance);
    }

    return clients.map((client): ClientWithBalance => ({
      ...client,
      properties_count: propertyCountByClient.get(client.id) ?? 0,
      outstanding_balance: balanceByClient.get(client.id) ?? 0,
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
};

export async function getClientById(id: string): Promise<DataResult<ClientDetail>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: client, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;

    const { data: properties } = await supabase
      .from("properties")
      .select("*")
      .eq("client_id", id)
      .order("street");

    const propertyIds = (properties ?? []).map((p) => p.id);

    const [{ data: jobs }, { data: quotes }, { data: invoices }] = await Promise.all([
      propertyIds.length
        ? supabase
            .from("jobs")
            .select("*")
            .in("property_id", propertyIds)
            .order("scheduled_date", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as Job[] }),
      supabase.from("quotes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("client_id", id).order("invoice_date", { ascending: false }),
    ]);

    const outstandingBalance = (invoices ?? [])
      .filter((inv) => inv.status !== "draft")
      .reduce((sum, inv) => sum + (inv.total - inv.amount_paid), 0);

    return {
      client,
      properties: properties ?? [],
      jobs: jobs ?? [],
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      outstanding_balance: outstandingBalance,
    };
  });
}
