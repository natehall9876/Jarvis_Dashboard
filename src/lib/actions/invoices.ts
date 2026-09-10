"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, requiredNumber, withError, runMutation } from "./shared";
import { logActivity } from "@/lib/data/activity-log";

async function recomputeInvoiceTotal(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  invoiceId: string,
) {
  const { data: items, error } = await supabase.from("invoice_items").select("total").eq("invoice_id", invoiceId);
  if (error) throw error;
  const subtotal = (items ?? []).reduce((sum, i) => sum + i.total, 0);
  const { error: updateError } = await supabase.from("invoices").update({ subtotal, tax: 0, total: subtotal }).eq("id", invoiceId);
  if (updateError) throw updateError;
}

function nextInvoiceNumber(): string {
  return `INV-${Date.now().toString().slice(-6)}`;
}

export async function createInvoice(formData: FormData) {
  const clientId = requiredString(formData, "client_id");
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const dueDate = optionalString(formData, "due_date");
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        client_id: clientId,
        property_id: optionalString(formData, "property_id"),
        invoice_number: optionalString(formData, "invoice_number") ?? nextInvoiceNumber(),
        status: "draft",
        due_date: dueDate ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        subtotal: 0,
        tax: 0,
        total: 0,
        amount_paid: 0,
        notes: optionalString(formData, "notes"),
      })
      .select("id")
      .single();
    if (error) throw error;
    await logActivity({
      entityType: "invoice",
      entityId: data.id,
      eventType: "invoice_created",
      summary: "Invoice created by owner",
      detail: { client_id: clientId },
      source: "owner",
    });
    return data.id as string;
  });

  if (!result.ok) redirect(withError("/invoices?new=1", result.message));
  redirect(`/invoices/${result.data}`);
}

export async function updateInvoice(invoiceId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("invoices")
      .update({
        property_id: optionalString(formData, "property_id"),
        due_date: optionalString(formData, "due_date"),
        notes: optionalString(formData, "notes"),
      })
      .eq("id", invoiceId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/invoices/${invoiceId}?edit=1`, result.message));
  redirect(`/invoices/${invoiceId}`);
}

export async function deleteDraftInvoice(invoiceId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { data: invoice, error: fetchError } = await supabase.from("invoices").select("status").eq("id", invoiceId).single();
    if (fetchError) throw fetchError;
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be deleted. Void it instead.");
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) throw error;
  });

  if (!result.ok) redirect(withError(`/invoices/${invoiceId}`, result.message));
  redirect("/invoices");
}

export async function voidInvoice(invoiceId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", invoiceId);
    if (error) throw error;
    await logActivity({
      entityType: "invoice",
      entityId: invoiceId,
      eventType: "invoice_voided",
      summary: "Invoice voided by owner",
      source: "owner",
    });
  });
  if (!result.ok) redirect(withError(`/invoices/${invoiceId}`, result.message));
  redirect(`/invoices/${invoiceId}`);
}

export async function sendInvoice(invoiceId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", invoiceId);
    if (error) throw error;
    await logActivity({
      entityType: "invoice",
      entityId: invoiceId,
      eventType: "invoice_sent",
      summary: "Invoice sent to client",
      source: "owner",
    });
  });
  if (!result.ok) redirect(withError(`/invoices/${invoiceId}`, result.message));
  redirect(`/invoices/${invoiceId}`);
}

export async function addInvoiceItem(invoiceId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const quantity = requiredNumber(formData, "quantity");
    const unitPrice = requiredNumber(formData, "unit_price");
    const { error } = await supabase.from("invoice_items").insert({
      invoice_id: invoiceId,
      service_id: optionalString(formData, "service_id"),
      description: requiredString(formData, "description"),
      quantity,
      unit_price: unitPrice,
      total: quantity * unitPrice,
    });
    if (error) throw error;
    await recomputeInvoiceTotal(supabase, invoiceId);
  });

  if (!result.ok) redirect(withError(`/invoices/${invoiceId}?addItem=1`, result.message));
  redirect(`/invoices/${invoiceId}`);
}

export async function removeInvoiceItem(invoiceId: string, itemId: string) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("invoice_items").delete().eq("id", itemId);
    if (error) throw error;
    await recomputeInvoiceTotal(supabase, invoiceId);
  });

  if (!result.ok) redirect(withError(`/invoices/${invoiceId}`, result.message));
  redirect(`/invoices/${invoiceId}`);
}

export async function recordPayment(invoiceId: string, clientId: string, formData: FormData) {
  const result = await runMutation(async () => {
    const supabase = await createSupabaseServerClient();
    const amount = requiredNumber(formData, "amount");

    const { error: paymentError } = await supabase.from("payments").insert({
      invoice_id: invoiceId,
      client_id: clientId,
      amount,
      payment_date: optionalString(formData, "payment_date") ?? new Date().toISOString().slice(0, 10),
      payment_method: optionalString(formData, "payment_method") ?? "cash",
      external_reference: optionalString(formData, "external_reference"),
      notes: optionalString(formData, "notes"),
    });
    if (paymentError) throw paymentError;

    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("amount_paid, total")
      .eq("id", invoiceId)
      .single();
    if (fetchError) throw fetchError;

    const newAmountPaid = invoice.amount_paid + amount;
    const patch: { amount_paid: number; status?: string; paid_at?: string } = { amount_paid: newAmountPaid };
    if (newAmountPaid >= invoice.total) {
      patch.status = "paid";
      patch.paid_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase.from("invoices").update(patch).eq("id", invoiceId);
    if (updateError) throw updateError;

    await logActivity({
      entityType: "invoice",
      entityId: invoiceId,
      eventType: "payment_recorded",
      summary: `Payment of $${amount.toLocaleString()} recorded${patch.status === "paid" ? " — invoice now paid in full" : ""}`,
      detail: { amount, new_amount_paid: newAmountPaid, invoice_total: invoice.total },
      source: "owner",
    });
  });

  if (!result.ok) redirect(withError(`/invoices/${invoiceId}?pay=1`, result.message));
  redirect(`/invoices/${invoiceId}`);
}
