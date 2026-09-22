"use server";

import { revalidatePath } from "next/cache";
import { disconnectQuickBooks } from "@/lib/integrations/quickbooks-connection";
import { getAllCustomers, getAllInvoices, getAllPayments, getCompanyInfo } from "@/lib/integrations/quickbooks-api";
import { summarizeQuickBooks, type QuickBooksSummary } from "@/lib/integrations/quickbooks-summary";
import { todayInZone } from "@/lib/integrations/homeworks-dates";

export type VerifyQuickBooksResult = { ok: true; companyName: string } | { ok: false; message: string; reason?: "not_connected" | "reauth_required" };

/** Read-only. The one real provider call that proves the stored token actually works — mirrors the Homeworks "Verify" button. */
export async function verifyQuickBooksConnection(): Promise<VerifyQuickBooksResult> {
  const result = await getCompanyInfo();
  if (!result.ok) return { ok: false, message: result.message, reason: result.reason === "not_connected" || result.reason === "reauth_required" ? result.reason : undefined };
  return { ok: true, companyName: result.data.CompanyName };
}

export type PreviewQuickBooksResult = { ok: true; summary: QuickBooksSummary } | { ok: false; message: string; reason?: "not_connected" | "reauth_required" };

/**
 * Read-only. Fetches every customer/invoice/payment (paginated, capped —
 * see quickbooks-api.ts) and reduces them to the honestly-separated
 * financial figures in quickbooks-summary.ts. Never writes anything, never
 * matches a QuickBooks customer to a Jarvis client.
 */
export async function previewQuickBooksFinancials(): Promise<PreviewQuickBooksResult> {
  const [customers, invoices, payments] = await Promise.all([getAllCustomers(), getAllInvoices(), getAllPayments()]);
  for (const r of [customers, invoices, payments]) {
    if (!r.ok) return { ok: false, message: r.message, reason: r.reason === "not_connected" || r.reason === "reauth_required" ? r.reason : undefined };
  }
  if (!customers.ok || !invoices.ok || !payments.ok) return { ok: false, message: "Unexpected error reading QuickBooks data." };
  const summary = summarizeQuickBooks({ customers: customers.data.customers, invoices: invoices.data.invoices, payments: payments.data.payments, today: todayInZone() });
  return { ok: true, summary };
}

export async function disconnectQuickBooksAction(): Promise<void> {
  await disconnectQuickBooks();
  revalidatePath("/settings");
}
