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

    let query = supabase.from("clients").select("*").order("name", { ascending: true });
    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},company_name.ilike.${term},email.ilike.${term}`);
    }

    const { data: clients, error } = await query;
    if (error) throw error;
    if (!clients || clients.length === 0) return [];

    const clientIds = clients.map((c) => c.id);

    const [{ data: properties }, { data: invoices }, { data: payments }] = await Promise.all([
      supabase.from("properties").select("id, client_id").in("client_id", clientIds),
      supabase
        .from("invoices")
        .select("id, client_id, total_amount, status")
        .in("client_id", clientIds)
        .neq("status", "draft"),
      supabase
        .from("payments")
        .select("invoice_id, client_id, amount")
        .in("client_id", clientIds),
    ]);

    const propertyCountByClient = new Map<string, number>();
    for (const p of properties ?? []) {
      propertyCountByClient.set(p.client_id, (propertyCountByClient.get(p.client_id) ?? 0) + 1);
    }

    const invoicedByClient = new Map<string, number>();
    for (const inv of invoices ?? []) {
      invoicedByClient.set(inv.client_id, (invoicedByClient.get(inv.client_id) ?? 0) + inv.total_amount);
    }

    const paidByClient = new Map<string, number>();
    for (const pay of payments ?? []) {
      paidByClient.set(pay.client_id, (paidByClient.get(pay.client_id) ?? 0) + pay.amount);
    }

    return clients.map((client): ClientWithBalance => ({
      ...client,
      properties_count: propertyCountByClient.get(client.id) ?? 0,
      outstanding_balance:
        (invoicedByClient.get(client.id) ?? 0) - (paidByClient.get(client.id) ?? 0),
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

    const [{ data: properties }, { data: jobs }, { data: quotes }, { data: invoices }, { data: payments }] =
      await Promise.all([
        supabase.from("properties").select("*").eq("client_id", id).order("address_line1"),
        supabase
          .from("jobs")
          .select("*")
          .eq("client_id", id)
          .order("scheduled_date", { ascending: false })
          .limit(50),
        supabase
          .from("quotes")
          .select("*")
          .eq("client_id", id)
          .order("issue_date", { ascending: false }),
        supabase
          .from("invoices")
          .select("*")
          .eq("client_id", id)
          .order("invoice_date", { ascending: false }),
        supabase.from("payments").select("amount").eq("client_id", id),
      ]);

    const totalInvoiced = (invoices ?? [])
      .filter((inv) => inv.status !== "draft")
      .reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalPaid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);

    return {
      client,
      properties: properties ?? [],
      jobs: jobs ?? [],
      quotes: quotes ?? [],
      invoices: invoices ?? [],
      outstanding_balance: totalInvoiced - totalPaid,
    };
  });
}
