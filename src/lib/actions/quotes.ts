"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  optionalString,
  requiredString,
  requiredNumber,
  optionalNumber,
  checkbox,
  withError,
  runMutation,
} from "./shared";

async function recomputeQuoteTotal(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  quoteId: string,
) {
  const { data: items, error } = await supabase.from("quote_items").select("total, is_optional").eq("quote_id", quoteId);
  if (error) throw error;
  const subtotal = (items ?? []).filter((i) => !i.is_optional).reduce((sum, i) => sum + i.total, 0);
  const { error: updateError } = await supabase
    .from("quotes")
    .update({ subtotal, tax: 0, total: subtotal })
    .eq("id", quoteId);
  if (updateError) throw updateError;
}

function nextQuoteNumber(): string {
  return `Q-${Date.now().toString().slice(-6)}`;
}

export async function createQuote(formData: FormData) {
  const clientId = requiredString(formData, "client_id");
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        client_id: clientId,
        property_id: optionalString(formData, "property_id"),
        quote_number: optionalString(formData, "quote_number") ?? nextQuoteNumber(),
        status: "draft",
        valid_until: optionalString(formData, "valid_until"),
        notes: optionalString(formData, "notes"),
        subtotal: 0,
        tax: 0,
        total: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/quotes?new=1", result.message));
  redirect(`/quotes/${result.data}`);
}

export async function updateQuote(quoteId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("quotes")
      .update({
        property_id: optionalString(formData, "property_id"),
        valid_until: optionalString(formData, "valid_until"),
        notes: optionalString(formData, "notes"),
      })
      .eq("id", quoteId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}?edit=1`, result.message));
  redirect(`/quotes/${quoteId}`);
}

export async function deleteDraftQuote(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data: quote, error: fetchError } = await supabase.from("quotes").select("status").eq("id", quoteId).single();
    if (fetchError) throw fetchError;
    if (quote.status !== "draft") throw new Error("Only draft quotes can be deleted. Decline it instead.");
    const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect("/quotes");
}

export async function addQuoteItem(quoteId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const quantity = requiredNumber(formData, "quantity");
    const unitPrice = requiredNumber(formData, "unit_price");
    const { error } = await supabase.from("quote_items").insert({
      quote_id: quoteId,
      service_id: optionalString(formData, "service_id"),
      description: requiredString(formData, "description"),
      quantity,
      unit_price: unitPrice,
      total: quantity * unitPrice,
      budgeted_hours: optionalNumber(formData, "budgeted_hours"),
      is_optional: checkbox(formData, "is_optional"),
    });
    if (error) throw error;
    await recomputeQuoteTotal(supabase, quoteId);
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}?addItem=1`, result.message));
  redirect(`/quotes/${quoteId}`);
}

export async function removeQuoteItem(quoteId: string, itemId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("quote_items").delete().eq("id", itemId);
    if (error) throw error;
    await recomputeQuoteTotal(supabase, quoteId);
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/quotes/${quoteId}`);
}

export async function sendQuote(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
    if (error) throw error;
  });
  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/quotes/${quoteId}`);
}

export async function acceptQuote(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("quotes").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", quoteId);
    if (error) throw error;
  });
  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/quotes/${quoteId}`);
}

export async function declineQuote(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("quotes").update({ status: "declined", declined_at: new Date().toISOString() }).eq("id", quoteId);
    if (error) throw error;
  });
  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/quotes/${quoteId}`);
}

/** Deliberate, explicit conversion — never automatic. Copies required line items into a new draft invoice. */
export async function convertQuoteToInvoice(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*, items:quote_items(*)")
      .eq("id", quoteId)
      .single();
    if (quoteError) throw quoteError;
    if (quote.status !== "accepted") throw new Error("Only accepted quotes can be converted to an invoice.");

    const requiredItems = (quote.items as { description: string; quantity: number; unit_price: number; total: number; service_id: string | null; is_optional: boolean }[]).filter((i) => !i.is_optional);
    const subtotal = requiredItems.reduce((sum, i) => sum + i.total, 0);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        client_id: quote.client_id,
        property_id: quote.property_id,
        invoice_number: `INV-${Date.now().toString().slice(-6)}`,
        status: "draft",
        due_date: dueDate.toISOString().slice(0, 10),
        subtotal,
        tax: 0,
        total: subtotal,
        amount_paid: 0,
        notes: `Converted from quote ${quote.quote_number ?? quote.id}.`,
      })
      .select("id")
      .single();
    if (invoiceError) throw invoiceError;

    if (requiredItems.length > 0) {
      const { error: itemsError } = await supabase.from("invoice_items").insert(
        requiredItems.map((i) => ({
          invoice_id: invoice.id,
          service_id: i.service_id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
        })),
      );
      if (itemsError) throw itemsError;
    }

    return invoice.id as string;
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/invoices/${result.data}`);
}

/** Creates one job from the quote's property — a starting point, not a full multi-line breakdown. */
export async function convertQuoteToJob(quoteId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*, items:quote_items(*)")
      .eq("id", quoteId)
      .single();
    if (quoteError) throw quoteError;
    if (quote.status !== "accepted") throw new Error("Only accepted quotes can be converted to a job.");
    if (!quote.property_id) throw new Error("This quote has no property to schedule a job for.");

    const items = quote.items as { service_id: string | null; total: number; budgeted_hours: number | null; is_optional: boolean }[];
    const requiredItems = items.filter((i) => !i.is_optional);
    const totalPrice = requiredItems.reduce((sum, i) => sum + i.total, 0);
    const totalBudgetedHours = requiredItems.reduce((sum, i) => sum + (i.budgeted_hours ?? 0), 0);
    const primaryServiceId = requiredItems.find((i) => i.service_id)?.service_id ?? null;

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        property_id: quote.property_id,
        service_id: primaryServiceId,
        status: "scheduled",
        price: totalPrice,
        budgeted_hours: totalBudgetedHours || null,
        notes: `Created from quote ${quote.quote_number ?? quote.id}. Set a scheduled date.`,
      })
      .select("id")
      .single();
    if (jobError) throw jobError;
    return job.id as string;
  });

  if (!result.ok) redirect(withError(`/quotes/${quoteId}`, result.message));
  redirect(`/jobs/${result.data}?edit=1`);
}
