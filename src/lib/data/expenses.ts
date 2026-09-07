import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Expense } from "@/types/domain";

export type ExpenseWithRelations = Expense & {
  job: { id: string; scheduled_date: string } | null;
  equipment: { id: string; name: string } | null;
};

export async function getExpenses(): Promise<DataResult<ExpenseWithRelations[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("expenses")
      .select("*, job:jobs(id, scheduled_date), equipment:equipment(id, name)")
      .order("expense_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ExpenseWithRelations[];
  });
}
