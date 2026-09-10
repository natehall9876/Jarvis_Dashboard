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

/**
 * A time entry's real hours: the stored `regular_hours` figure when present,
 * otherwise the clock-in/clock-out difference. Centralized here (rather than
 * duplicated per call site) because it feeds two different, deliberately
 * distinct numbers — see `hoursForTimeEntry` usage in command-center.ts.
 */
export function hoursForTimeEntry(entry: { regular_hours: number | null; clock_in: string | null; clock_out: string | null }): number {
  if (entry.regular_hours !== null) return entry.regular_hours;
  if (entry.clock_in && entry.clock_out) {
    return (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3_600_000;
  }
  return 0;
}

/**
 * Two different, deliberately non-interchangeable production numbers:
 *
 * "Field production $/hr" (productionRate above, fed by job.actual_hours)
 * measures revenue against only the on-site work duration recorded per job
 * — it looks great even when a crew spends real paid time driving between
 * stops or waiting, because that time never shows up in any job's
 * actual_hours.
 *
 * "True paid $/hr" (this function) measures the same revenue against every
 * clocked hour for the crew in the same window — via time_entries, which
 * exist independently of any single job (a time entry's job_id is
 * nullable) and so capture drive time, gaps, and anything else that isn't
 * attributed to a specific job. This is the honest number for "is this
 * route/crew/period actually profitable after everything we paid for."
 */
export function truePaidRate(revenue: number, totalPaidHours: number | null | undefined): number | null {
  if (!totalPaidHours || totalPaidHours <= 0) return null;
  return revenue / totalPaidHours;
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
