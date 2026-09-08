/**
 * Shared business calculations. Kept pure and framework-free so they can be
 * unit tested independently of Supabase and used in both server data-access
 * code and the reports pages.
 */

/** Production rate = job revenue / actual production hours. */
export function productionRate(revenue: number, actualHours: number | null | undefined): number | null {
  if (!actualHours || actualHours <= 0) return null;
  return revenue / actualHours;
}

export function laborCost(hours: number, hourlyRate: number): number {
  return hours * hourlyRate;
}

export function grossProfit(revenue: number, laborCostValue: number, otherCosts = 0): number {
  return revenue - laborCostValue - otherCosts;
}

export function grossMarginPercent(revenue: number, grossProfitValue: number): number | null {
  if (revenue <= 0) return null;
  return (grossProfitValue / revenue) * 100;
}

export function averageTicket(totalRevenue: number, jobCount: number): number | null {
  if (jobCount <= 0) return null;
  return totalRevenue / jobCount;
}

export function quoteAcceptanceRate(accepted: number, decided: number): number | null {
  if (decided <= 0) return null;
  return (accepted / decided) * 100;
}

export function laborCostPercent(totalLaborCost: number, totalRevenue: number): number | null {
  if (totalRevenue <= 0) return null;
  return (totalLaborCost / totalRevenue) * 100;
}

export function invoiceBalance(totalAmount: number, amountPaid: number): number {
  return Math.max(0, totalAmount - amountPaid);
}

/**
 * The `invoices.status` column only reliably holds what the app writes
 * directly (draft/sent/paid/void) — "partial" and "overdue" are display
 * states derived from balance and due date rather than stored values, so we
 * compute them here instead of trusting the raw column for those cases.
 */
export function invoiceDisplayStatus(invoice: {
  status: string;
  balance: number;
  days_overdue: number;
}): "draft" | "sent" | "partial" | "paid" | "overdue" | "void" {
  if (invoice.status === "draft" || invoice.status === "void") return invoice.status;
  if (invoice.balance <= 0) return "paid";
  if (invoice.days_overdue > 0) return "overdue";
  if (invoice.status === "sent") return "sent";
  return "partial";
}
