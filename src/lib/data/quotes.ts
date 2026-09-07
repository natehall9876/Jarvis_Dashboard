import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, QuoteWithItems } from "@/types/domain";

const QUOTE_SELECT = `
  *,
  client:clients(id, name, company_name),
  items:quote_items(*)
`;

export async function getQuotes(): Promise<DataResult<QuoteWithItems[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("quotes")
      .select(QUOTE_SELECT)
      .order("issue_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as QuoteWithItems[];
  });
}

export async function getQuoteById(id: string): Promise<DataResult<QuoteWithItems>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("quotes")
      .select(QUOTE_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as QuoteWithItems;
  });
}

export function quoteTotal(quote: QuoteWithItems, includeOptional = false): number {
  return quote.items
    .filter((item) => includeOptional || !item.is_optional)
    .reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}
