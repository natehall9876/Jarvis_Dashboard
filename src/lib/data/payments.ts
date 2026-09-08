import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Payment } from "@/types/domain";

export type PaymentWithRelations = Payment & {
  client: { id: string; first_name: string | null; last_name: string | null; company_name: string | null } | null;
  invoice: { id: string; invoice_number: string | null } | null;
};

export async function getPayments(): Promise<DataResult<PaymentWithRelations[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payments")
      .select("*, client:clients(id, first_name, last_name, company_name), invoice:invoices(id, invoice_number)")
      .order("payment_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PaymentWithRelations[];
  });
}
