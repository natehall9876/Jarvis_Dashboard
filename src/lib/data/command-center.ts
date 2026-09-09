import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { getOverdueInvoices } from "@/lib/data/invoices";
import { getEquipment } from "@/lib/data/equipment";
import {
  averageTicket,
  grossProfit,
  laborCost as calcLaborCost,
  productionRate,
  quoteAcceptanceRate,
} from "@/lib/calculations";
import type { DataResult, InvoiceWithClient, JobWithRelations, QuoteWithItems } from "@/types/domain";
import type { EquipmentWithMaintenanceFlag } from "@/lib/data/equipment";

const JOB_RELATIONS_SELECT = `
  *,
  property:properties(*, client:clients(id, first_name, last_name, company_name)),
  service:services(id, name)
`;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// ---------------------------------------------------------------------------
// Today's Mission
// ---------------------------------------------------------------------------

export type PriorityItem = {
  label: string;
  detail: string;
  severity: "critical" | "warning" | "info";
  href: string;
};

export type TodaysMission = {
  date: string;
  jobs: JobWithRelations[];
  jobCount: number;
  expectedRevenue: number;
  budgetedHours: number;
  crewWorking: { id: string; name: string }[];
  routesRunning: string[];
  scheduleChanges: JobWithRelations[];
  quotesNeedingFollowUp: QuoteWithItems[];
  overdueInvoices: InvoiceWithClient[];
  equipmentIssues: EquipmentWithMaintenanceFlag[];
  priorities: PriorityItem[];
};

const FOLLOW_UP_AFTER_DAYS = 3;

export async function getTodaysMission(): Promise<DataResult<TodaysMission>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const today = toISODate(new Date());

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(JOB_RELATIONS_SELECT)
      .eq("scheduled_date", today)
      .order("scheduled_start_time", { ascending: true, nullsFirst: true });
    if (jobsError) throw jobsError;

    const todaysJobs = (jobs ?? []) as unknown as JobWithRelations[];
    const activeJobs = todaysJobs.filter((j) => j.status !== "cancelled");
    const scheduleChanges = todaysJobs.filter((j) => j.status === "cancelled" || j.status === "skipped");

    const jobIds = todaysJobs.map((j) => j.id);
    const { data: jobEmployees } = jobIds.length
      ? await supabase.from("job_employees").select("employee:employees(id, first_name, last_name)").in("job_id", jobIds)
      : { data: [] };

    const crewMap = new Map<string, { id: string; name: string }>();
    for (const je of jobEmployees ?? []) {
      const employee = (je as unknown as { employee: { id: string; first_name: string; last_name: string | null } | null })
        .employee;
      if (employee) {
        crewMap.set(employee.id, { id: employee.id, name: [employee.first_name, employee.last_name].filter(Boolean).join(" ") });
      }
    }

    const routesRunning = Array.from(
      new Set(todaysJobs.map((j) => j.route_id).filter((id): id is string => id !== null)),
    );

    const { data: quotes } = await supabase
      .from("quotes")
      .select(`*, client:clients(id, first_name, last_name, company_name), items:quote_items(*)`)
      .eq("status", "sent");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FOLLOW_UP_AFTER_DAYS);
    const quotesNeedingFollowUp = ((quotes ?? []) as unknown as QuoteWithItems[]).filter((q) => {
      const sentAt = q.sent_at ? new Date(q.sent_at) : null;
      return sentAt !== null && sentAt <= cutoff;
    });

    const [overdueResult, equipmentResult] = await Promise.all([getOverdueInvoices(5), getEquipment()]);

    const overdueInvoices = overdueResult.data ?? [];
    const equipmentIssues = (equipmentResult.data ?? []).filter(
      (e) => e.status !== "active" || e.maintenance_warning,
    );

    const expectedRevenue = activeJobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
    const budgetedHours = activeJobs.reduce((sum, j) => sum + (j.budgeted_hours ?? 0), 0);

    const priorities = buildPriorities({
      overdueInvoices,
      quotesNeedingFollowUp,
      equipmentIssues,
      scheduleChanges,
    });

    return {
      date: today,
      jobs: todaysJobs,
      jobCount: activeJobs.length,
      expectedRevenue,
      budgetedHours,
      crewWorking: Array.from(crewMap.values()),
      routesRunning,
      scheduleChanges,
      quotesNeedingFollowUp,
      overdueInvoices,
      equipmentIssues,
      priorities,
    };
  });
}

/**
 * Deterministic, rules-based priority ranking — not an LLM call. This is
 * intentionally separate from the AI Advisor: it surfaces the most urgent
 * real numbers in the data rather than generating language about them.
 */
function buildPriorities(input: {
  overdueInvoices: InvoiceWithClient[];
  quotesNeedingFollowUp: QuoteWithItems[];
  equipmentIssues: EquipmentWithMaintenanceFlag[];
  scheduleChanges: JobWithRelations[];
}): PriorityItem[] {
  const items: PriorityItem[] = [];

  if (input.overdueInvoices.length > 0) {
    const total = input.overdueInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    items.push({
      label: `${input.overdueInvoices.length} overdue invoice${input.overdueInvoices.length === 1 ? "" : "s"}`,
      detail: `$${total.toLocaleString()} in receivables past due`,
      severity: "critical",
      href: input.overdueInvoices.length === 1 ? `/invoices/${input.overdueInvoices[0].id}` : "/invoices",
    });
  }

  if (input.equipmentIssues.length > 0) {
    items.push({
      label: `${input.equipmentIssues.length} equipment issue${input.equipmentIssues.length === 1 ? "" : "s"}`,
      detail: "Out of service or maintenance due soon",
      severity: "warning",
      href: input.equipmentIssues.length === 1 ? `/equipment/${input.equipmentIssues[0].id}` : "/equipment",
    });
  }

  if (input.scheduleChanges.length > 0) {
    items.push({
      label: `${input.scheduleChanges.length} job${input.scheduleChanges.length === 1 ? "" : "s"} cancelled or skipped today`,
      detail: "Review crew and route impact",
      severity: "warning",
      href: input.scheduleChanges.length === 1 ? `/jobs/${input.scheduleChanges[0].id}` : "/schedule",
    });
  }

  if (input.quotesNeedingFollowUp.length > 0) {
    items.push({
      label: `${input.quotesNeedingFollowUp.length} quote${input.quotesNeedingFollowUp.length === 1 ? "" : "s"} awaiting follow-up`,
      detail: `Sent more than ${FOLLOW_UP_AFTER_DAYS} days ago with no response`,
      severity: "info",
      href: input.quotesNeedingFollowUp.length === 1 ? `/quotes/${input.quotesNeedingFollowUp[0].id}` : "/quotes",
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Business Pulse
// ---------------------------------------------------------------------------

export type BusinessPulse = {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  accountsReceivable: number;
  cashCollectedMonth: number;
  outstandingInvoiceCount: number;
  productionDollarsPerHour: number | null;
  laborCostMonth: number;
  grossProfitMonth: number;
  averageTicketMonth: number | null;
  jobsCompletedMonth: number;
  quoteAcceptanceRatePct: number | null;
};

export async function getBusinessPulse(): Promise<DataResult<BusinessPulse>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = toISODate(now);
    const weekStartStr = toISODate(startOfWeek(now));
    const monthStartStr = toISODate(startOfMonth(now));

    const { data: monthJobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, price, actual_hours, scheduled_date, status")
      .gte("scheduled_date", monthStartStr)
      .lte("scheduled_date", today);
    if (jobsError) throw jobsError;

    const completedJobs = (monthJobs ?? []).filter((j) => j.status === "completed");

    const revenueToday = completedJobs
      .filter((j) => j.scheduled_date === today)
      .reduce((sum, j) => sum + (j.price ?? 0), 0);
    const revenueWeek = completedJobs
      .filter((j) => (j.scheduled_date ?? "") >= weekStartStr)
      .reduce((sum, j) => sum + (j.price ?? 0), 0);
    const revenueMonth = completedJobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
    const totalActualHoursMonth = completedJobs.reduce((sum, j) => sum + (j.actual_hours ?? 0), 0);

    const { data: payments } = await supabase
      .from("payments")
      .select("amount, payment_date")
      .gte("payment_date", monthStartStr);
    const cashCollectedMonth = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);

    const { data: employees } = await supabase.from("employees").select("id, hourly_rate");
    const rateByEmployee = new Map((employees ?? []).map((e) => [e.id, e.hourly_rate ?? 0]));

    const { data: timeEntries } = await supabase
      .from("time_entries")
      .select("employee_id, regular_hours, clock_in, clock_out, work_date")
      .gte("work_date", monthStartStr);

    const laborCostMonth = (timeEntries ?? []).reduce((sum, entry) => {
      const hours =
        entry.regular_hours ??
        (entry.clock_in && entry.clock_out
          ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3_600_000
          : 0);
      return sum + calcLaborCost(hours, rateByEmployee.get(entry.employee_id) ?? 0);
    }, 0);

    const [invoicesResult, quotesResponse] = await Promise.all([
      supabase.from("invoices").select("total, amount_paid, status"),
      supabase.from("quotes").select("status, accepted_at, declined_at").gte("created_at", monthStartStr),
    ]);

    // Void invoices are cancelled debt, not outstanding receivables.
    const nonDraftInvoices = (invoicesResult.data ?? []).filter((i) => i.status !== "draft" && i.status !== "void");
    const accountsReceivable = nonDraftInvoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.total - inv.amount_paid),
      0,
    );
    const outstandingInvoiceCount = nonDraftInvoices.filter((inv) => inv.total - inv.amount_paid > 0).length;

    const decidedQuotes = (quotesResponse.data ?? []).filter((q) => q.accepted_at !== null || q.declined_at !== null);
    const acceptedQuotes = decidedQuotes.filter((q) => q.accepted_at !== null);

    return {
      revenueToday,
      revenueWeek,
      revenueMonth,
      accountsReceivable,
      cashCollectedMonth,
      outstandingInvoiceCount,
      productionDollarsPerHour: productionRate(revenueMonth, totalActualHoursMonth),
      laborCostMonth,
      grossProfitMonth: grossProfit(revenueMonth, laborCostMonth),
      averageTicketMonth: averageTicket(revenueMonth, completedJobs.length),
      jobsCompletedMonth: completedJobs.length,
      quoteAcceptanceRatePct: quoteAcceptanceRate(acceptedQuotes.length, decidedQuotes.length),
    };
  });
}
