"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, requiredNumber, withError, runMutation } from "./shared";
import type { ExpenseInsert } from "@/types/domain";

function expenseFieldsFromForm(formData: FormData): ExpenseInsert {
  return {
    expense_date: optionalString(formData, "expense_date") ?? new Date().toISOString().slice(0, 10),
    category: requiredString(formData, "category"),
    vendor: requiredString(formData, "vendor"),
    description: optionalString(formData, "description"),
    amount: requiredNumber(formData, "amount"),
    job_id: optionalString(formData, "job_id"),
    equipment_id: optionalString(formData, "equipment_id"),
    notes: optionalString(formData, "notes"),
  };
}

export async function createExpense(formData: FormData) {
  const fields = expenseFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("expenses").insert(fields);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError("/expenses?new=1", result.message));
  redirect("/expenses");
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const fields = expenseFieldsFromForm(formData);
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("expenses").update(fields).eq("id", expenseId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/expenses?edit=${expenseId}`, result.message));
  redirect("/expenses");
}

export async function deleteExpense(expenseId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError("/expenses", result.message));
  redirect("/expenses");
}
