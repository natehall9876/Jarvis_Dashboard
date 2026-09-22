import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrNotFound, withDataResult } from "@/lib/data/shared";
import { daysOverdue } from "@/lib/format";
import { invoiceDisplayStatus } from "@/lib/calculations";
import type { DataResult, Invoice, InvoiceItem, InvoiceWithClient, Payment } from "@/types/domain";

const INVOICE_SELECT = `
  *,
  client:clients(id, first_name, last_name, company_name, data_source),
  property:properties(id, street)
`;

function enrichInvoice(
  invoice: Invoice & { client: InvoiceWithClient["client"]; property: InvoiceWithClient["property"] },
): InvoiceWithClient {
  // A voided invoice's remaining balance is cancelled debt, not money still
  // owed — it must not feed into receivables, overdue lists, or revenue math.
  const balance = invoice.status === "void" ? 0 : Math.max(0, invoice.total - invoice.amount_paid);
  const overdueDays = balance > 0 ? Math.max(0, daysOverdue(invoice.due_date)) : 0;
  const enriched: InvoiceWithClient = {
    ...invoice,
    balance,
    days_overdue: overdueDays,
    display_status: "draft",
  };
  enriched.display_status = invoiceDisplayStatus(enriched);
  return enriched;
}

export async function getInvoices(): Promise<DataResult<InvoiceWithClient[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(INVOICE_SELECT)
      .order("invoice_date", { ascending: false });
    if (error) throw error;

    return ((invoices ?? []) as unknown as (Invoice & {
      client: InvoiceWithClient["client"];
      property: InvoiceWithClient["property"];
    })[]).map(enrichInvoice);
  });
}

export type InvoiceDetail = InvoiceWithClient & {
  items: InvoiceItem[];
  payments: Payment[];
};

export async function getInvoiceById(id: string): Promise<DataResult<InvoiceDetail | null>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const invoice = await getOrNotFound(supabase.from("invoices").select(INVOICE_SELECT).eq("id", id).maybeSingle());
    if (!invoice) return null;

    const [{ data: items }, { data: payments }] = await Promise.all([
      supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false }),
    ]);

    const enriched = enrichInvoice(
      invoice as unknown as Invoice & {
        client: InvoiceWithClient["client"];
        property: InvoiceWithClient["property"];
      },
    );

    return {
      ...enriched,
      items: items ?? [],
      payments: payments ?? [],
    };
  });
}

/**
 * Feeds "what needs attention" summaries (Command Center priorities, the AI
 * Advisor's get_overdue_invoices/get_attention_items tools) — confirmed-demo
 * clients are excluded here so a seed-data invoice never shows up as real
 * money owed. The raw Invoices list page uses getInvoices() directly and
 * intentionally still shows every record (nothing is hidden there, only
 * excluded from "this is real business money" summaries).
 */
export async function getOverdueInvoices(limit = 10): Promise<DataResult<InvoiceWithClient[]>> {
  const result = await getInvoices();
  if (result.error !== null) return { data: null, error: result.error };

  return {
    data: result.data
      .filter((inv) => inv.balance > 0 && inv.days_overdue > 0 && inv.client?.data_source !== "demo")
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .slice(0, limit),
    error: null,
  };
}
