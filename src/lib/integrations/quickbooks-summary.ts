/**
 * Pure summarization of QuickBooks financial data. Each figure below comes
 * from exactly ONE QuickBooks entity type, never combined or derived from
 * two sources at once — that is what prevents double-counting: invoiced and
 * outstanding both come only from Invoice rows; collected comes only from
 * Payment rows (which is the real cash-received record in QuickBooks,
 * distinct from an invoice's own Balance field — a payment can be applied to
 * multiple invoices or recorded with no invoice at all, e.g. a sales
 * receipt, so summing invoice balances is not the same computation as
 * summing payments and must never be presented as if it were).
 *
 * This module does NOT match QuickBooks customers to Jarvis clients. That is
 * a genuinely separate, higher-risk feature (ambiguous-name matching, the
 * same class of problem the Homeworks linking workflow solves) that hasn't
 * been built — every figure here is reported at the QuickBooks-account
 * level only.
 */
import type { QuickBooksCustomer, QuickBooksInvoice, QuickBooksPayment } from "@/lib/integrations/quickbooks-api";

export type QuickBooksSummary = {
  customerCount: number;
  invoiceCount: number;
  totalInvoiced: number;
  totalOutstanding: number;
  overdueInvoiceCount: number;
  overdueAmount: number;
  paymentCount: number;
  totalCollected: number;
};

export function summarizeQuickBooks(input: { customers: QuickBooksCustomer[]; invoices: QuickBooksInvoice[]; payments: QuickBooksPayment[]; today: string }): QuickBooksSummary {
  const overdue = input.invoices.filter((inv) => inv.Balance > 0 && inv.DueDate !== undefined && inv.DueDate < input.today);
  return {
    customerCount: input.customers.length,
    invoiceCount: input.invoices.length,
    totalInvoiced: round2(input.invoices.reduce((sum, inv) => sum + inv.TotalAmt, 0)),
    totalOutstanding: round2(input.invoices.reduce((sum, inv) => sum + inv.Balance, 0)),
    overdueInvoiceCount: overdue.length,
    overdueAmount: round2(overdue.reduce((sum, inv) => sum + inv.Balance, 0)),
    paymentCount: input.payments.length,
    totalCollected: round2(input.payments.reduce((sum, p) => sum + p.TotalAmt, 0)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
