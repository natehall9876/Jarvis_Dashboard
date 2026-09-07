import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { daysOverdue } from "@/lib/format";
import type { DataResult, Invoice, InvoiceItem, InvoiceWithClient, Payment } from "@/types/domain";

const INVOICE_SELECT = `
  *,
  client:clients(id, name, company_name),
  property:properties(id, address_line1)
`;

async function attachPaymentInfo(
  invoices: (Invoice & { client: InvoiceWithClient["client"]; property: InvoiceWithClient["property"] })[],
  payments: Pick<Payment, "invoice_id" | "amount">[],
): Promise<InvoiceWithClient[]> {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount);
  }

  return invoices.map((invoice) => {
    const amountPaid = paidByInvoice.get(invoice.id) ?? 0;
    const balance = Math.max(0, invoice.total_amount - amountPaid);
    return {
      ...invoice,
      amount_paid: amountPaid,
      balance,
      days_overdue: balance > 0 ? Math.max(0, daysOverdue(invoice.due_date)) : 0,
    };
  });
}

export async function getInvoices(): Promise<DataResult<InvoiceWithClient[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .order("invoice_date", { ascending: false });
    if (error) throw error;
    if (!invoices || invoices.length === 0) return [];

    const invoiceIds = invoices.map((i) => i.id);
    const { data: payments } = await supabase
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds);

    return attachPaymentInfo(
      invoices as unknown as (Invoice & {
        client: InvoiceWithClient["client"];
        property: InvoiceWithClient["property"];
      })[],
      payments ?? [],
    );
  });
}

export type InvoiceDetail = InvoiceWithClient & {
  items: InvoiceItem[];
  payments: Payment[];
};

export async function getInvoiceById(id: string): Promise<DataResult<InvoiceDetail>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;

    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false }),
    ]);

    const [enriched] = await attachPaymentInfo(
      [invoice as unknown as Invoice & { client: InvoiceWithClient["client"]; property: InvoiceWithClient["property"] }],
      payments ?? [],
    );

    return {
      ...enriched,
      items: items ?? [],
      payments: payments ?? [],
    };
  });
}

export async function getOverdueInvoices(limit = 10): Promise<DataResult<InvoiceWithClient[]>> {
  const result = await getInvoices();
  if (result.error !== null) return { data: null, error: result.error };

  return {
    data: result.data
      .filter((inv) => inv.balance > 0 && inv.days_overdue > 0)
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .slice(0, limit),
    error: null,
  };
}
