import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addDaysISO, todayInZone } from "@/lib/integrations/homeworks-dates";
import { withDataResult } from "@/lib/data/shared";
import { getOverdueInvoices } from "@/lib/data/invoices";
import { getEquipment } from "@/lib/data/equipment";
import { getOpenTasks, type OwnerTask } from "@/lib/data/notes-tasks";
import { detectScheduleConflicts, type ScheduleConflict } from "@/lib/scheduling/conflicts";
import { getDemoClientIds, getDemoPropertyIds } from "@/lib/data/data-source";
import {
  averageTicket,
  DEFAULT_CREW_HOUR_TARGET,
  grossProfit,
  laborCost as calcLaborCost,
  productionRate,
  quoteAcceptanceRate,
  hoursForTimeEntry,
  truePaidRate,
} from "@/lib/calculations";
import type { DataResult, InvoiceWithClient, JobWithRelations, QuoteWithItems } from "@/types/domain";
import type { EquipmentWithMaintenanceFlag } from "@/lib/data/equipment";

const JOB_RELATIONS_SELECT = `
  *,
  property:properties(*, client:clients(id, first_name, last_name, company_name, data_source)),
  service:services(id, name)
`;

/** True once a client is *confirmed* demo/seed data — never true for merely-unverified provenance. */
function isDemoJob(job: { property?: { client?: { data_source?: string } | null } | null }): boolean {
  return job.property?.client?.data_source === "demo";
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
  /** Assigned employee count per job ID (jobs with no assignment are absent or 0). */
  crewCountByJob: Record<string, number>;
  routesRunning: string[];
  scheduleChanges: JobWithRelations[];
  quotesNeedingFollowUp: QuoteWithItems[];
  overdueInvoices: InvoiceWithClient[];
  equipmentIssues: EquipmentWithMaintenanceFlag[];
  priorities: PriorityItem[];
  unavailableSections: ("crew" | "quotes" | "invoices" | "equipment" | "tasks")[];
};

const FOLLOW_UP_AFTER_DAYS = 3;

export async function getTodaysMission(): Promise<DataResult<TodaysMission>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const today = todayInZone();

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select(JOB_RELATIONS_SELECT)
      .eq("scheduled_date", today)
      .order("scheduled_start_time", { ascending: true, nullsFirst: true });
    if (jobsError) throw jobsError;

    const todaysJobs = (jobs ?? []) as unknown as JobWithRelations[];
    // Confirmed-demo jobs still render in the raw job list (so nothing looks
    // like it silently vanished), but never count toward the real revenue/
    // hours totals or the crew/route rollups below.
    const activeJobs = todaysJobs.filter((j) => j.status !== "cancelled" && j.status !== "skipped" && !isDemoJob(j));
    const scheduleChanges = todaysJobs.filter((j) => !isDemoJob(j) && (j.status === "cancelled" || j.status === "skipped"));

    const jobIds = activeJobs.map((j) => j.id);
    const { data: jobEmployees, error: crewError } = jobIds.length
      ? await supabase.from("job_employees").select("job_id, employee:employees(id, first_name, last_name)").in("job_id", jobIds)
      : { data: [], error: null };

    const crewMap = new Map<string, { id: string; name: string }>();
    const crewCountByJob: Record<string, number> = {};
    const crewNamesByJob: Record<string, string[]> = {};
    for (const je of jobEmployees ?? []) {
      const jobId = (je as unknown as { job_id: string }).job_id;
      crewCountByJob[jobId] = (crewCountByJob[jobId] ?? 0) + 1;
      const employee = (je as unknown as { employee: { id: string; first_name: string; last_name: string | null } | null })
        .employee;
      if (employee) {
        crewMap.set(employee.id, { id: employee.id, name: [employee.first_name, employee.last_name].filter(Boolean).join(" ") });
        const name = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
        (crewNamesByJob[jobId] ??= []).push(name);
      }
    }

    const routesRunning = Array.from(
      new Set(activeJobs.map((j) => j.route_id).filter((id): id is string => id !== null)),
    );

    const { data: quotes, error: quotesError } = await supabase
      .from("quotes")
      .select(`*, client:clients(id, first_name, last_name, company_name, data_source), items:quote_items(*)`)
      .eq("status", "sent");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - FOLLOW_UP_AFTER_DAYS);
    const quotesNeedingFollowUp = ((quotes ?? []) as unknown as QuoteWithItems[]).filter((q) => {
      const sentAt = q.sent_at ? new Date(q.sent_at) : null;
      return sentAt !== null && sentAt <= cutoff && q.client?.data_source !== "demo";
    });

    const [overdueResult, equipmentResult, tasksResult] = await Promise.all([getOverdueInvoices(5), getEquipment(), getOpenTasks(200)]);

    const unavailableSections: TodaysMission["unavailableSections"] = [];
    if (crewError) unavailableSections.push("crew");
    if (quotesError) unavailableSections.push("quotes");
    if (overdueResult.error) unavailableSections.push("invoices");
    if (equipmentResult.error) unavailableSections.push("equipment");
    if (tasksResult.error) unavailableSections.push("tasks");
    const overdueInvoices = overdueResult.data ?? [];
    const equipmentIssues = (equipmentResult.data ?? []).filter(
      (e) => e.status !== "active" || e.maintenance_warning,
    );
    const overdueTasks = tasksResult.data.filter((t) => t.dueDate !== null && t.dueDate < today);

    const conflicts = detectScheduleConflicts(
      activeJobs.map((j) => ({ id: j.id, label: j.service?.name ?? "Job", crew: crewNamesByJob[j.id] ?? [], scheduledStartTime: j.scheduled_start_time, budgetedHours: j.budgeted_hours })),
    );

    const expectedRevenue = activeJobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
    const budgetedHours = activeJobs.reduce((sum, j) => sum + (j.budgeted_hours ?? 0), 0);

    const priorities = buildPriorities({
      overdueInvoices,
      quotesNeedingFollowUp,
      equipmentIssues,
      scheduleChanges,
      conflicts,
      overdueTasks,
    });

    return {
      date: today,
      jobs: todaysJobs,
      jobCount: activeJobs.length,
      expectedRevenue,
      budgetedHours,
      crewWorking: Array.from(crewMap.values()),
      crewCountByJob,
      routesRunning,
      scheduleChanges,
      quotesNeedingFollowUp,
      overdueInvoices,
      equipmentIssues,
      priorities,
      unavailableSections,
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
  conflicts: ScheduleConflict[];
  overdueTasks: OwnerTask[];
}): PriorityItem[] {
  const items: PriorityItem[] = [];

  if (input.conflicts.length > 0) {
    const first = input.conflicts[0];
    items.push({
      label: `${input.conflicts.length} scheduling conflict${input.conflicts.length === 1 ? "" : "s"} today`,
      detail: `${first.crewMember} double-booked ${first.jobA.start}–${first.jobA.end} & ${first.jobB.start}–${first.jobB.end}`,
      severity: "critical",
      href: "/schedule",
    });
  }

  if (input.overdueTasks.length > 0) {
    items.push({
      label: `${input.overdueTasks.length} overdue task${input.overdueTasks.length === 1 ? "" : "s"}`,
      detail: input.overdueTasks[0].title,
      severity: "warning",
      href: "/",
    });
  }

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
  /**
   * Same month's revenue against every clocked crew hour (time_entries),
   * not just the hours recorded against a specific job — this is usually
   * lower than productionDollarsPerHour, and the gap is real: it's drive
   * time, waiting, and anything else that's paid for but not attributed to
   * a job. See lib/calculations.ts's truePaidRate for the full reasoning.
   */
  truePaidDollarsPerHour: number | null;
  totalPaidHoursMonth: number;
  laborCostMonth: number;
  grossProfitMonth: number;
  averageTicketMonth: number | null;
  jobsCompletedMonth: number;
  quoteAcceptanceRatePct: number | null;
  /** The configurable planning target used for the vs-target comparisons — see lib/calculations.ts. */
  crewHourTarget: number;
  /**
   * The price of every non-cancelled, non-skipped job scheduled this month, whatever its
   * status — this is NOT money owed or earned, only what the board is worth
   * if everything on it happens. Distinct from revenueMonth (completed jobs
   * only, the closest thing to "actually earned") and cashCollectedMonth
   * (the only genuinely collected figure, from real payments).
   */
  scheduledRevenueMonth: number;
  /** Sum of currently-open (sent, undecided) quote totals — work quoted but not yet won or lost. */
  pendingEstimatesValue: number;
  pendingEstimatesCount: number;
};

export async function getBusinessPulse(now: Date = new Date()): Promise<DataResult<BusinessPulse>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const today = todayInZone(now);
    // Calendar arithmetic on Eastern date labels is independent of host TZ/DST.
    const dayOfWeek = new Date(today + "T12:00:00Z").getUTCDay();
    const weekStartStr = addDaysISO(today, -((dayOfWeek + 6) % 7));
    const monthStartStr = today.slice(0, 7) + "-01";
    const monthEndStr = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const revenueStart = weekStartStr < monthStartStr ? weekStartStr : monthStartStr;

    const [{ data: monthJobs, error: jobsError }, { data: fullMonthJobs, error: fullMonthError }, demoPropertyIds, demoClientIds] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, price, actual_hours, scheduled_date, status, property_id")
        .gte("scheduled_date", revenueStart)
        .lte("scheduled_date", today),
      // Separate query covering the WHOLE month (including days not yet reached) —
      // monthJobs above is deliberately capped at today so completed-revenue math
      // never counts a future date as if it already happened.
      supabase
        .from("jobs")
        .select("price, status, property_id")
        .gte("scheduled_date", monthStartStr)
        .lte("scheduled_date", monthEndStr)
        .neq("status", "cancelled"),
      getDemoPropertyIds(),
      getDemoClientIds(),
    ]);
    if (jobsError) throw jobsError;
    if (fullMonthError) throw fullMonthError;

    const scheduledRevenueMonth = (fullMonthJobs ?? [])
      .filter((j) => j.status !== "skipped" && !demoPropertyIds.has(j.property_id))
      .reduce((sum, j) => sum + (j.price ?? 0), 0);

    // Confirmed-demo jobs/invoices/quotes are excluded from every figure
    // below — this is the one place Business Pulse's real $ totals are
    // computed, so it's the one place that matters most.
    const completedPeriodJobs = (monthJobs ?? []).filter(
      (j) => j.status === "completed" && !demoPropertyIds.has(j.property_id),
    );

    const completedJobs = completedPeriodJobs.filter((j) => (j.scheduled_date ?? "") >= monthStartStr);
    const revenueToday = completedJobs
      .filter((j) => j.scheduled_date === today)
      .reduce((sum, j) => sum + (j.price ?? 0), 0);
    const revenueWeek = completedPeriodJobs
      .filter((j) => (j.scheduled_date ?? "") >= weekStartStr)
      .reduce((sum, j) => sum + (j.price ?? 0), 0);
    const revenueMonth = completedJobs.reduce((sum, j) => sum + (j.price ?? 0), 0);
    const totalActualHoursMonth = completedJobs.reduce((sum, j) => sum + (j.actual_hours ?? 0), 0);

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount, payment_date, client_id")
      .gte("payment_date", monthStartStr)
      .lte("payment_date", today);
    if (paymentsError) throw paymentsError;
    const cashCollectedMonth = (payments ?? []).filter((p) => !demoClientIds.has(p.client_id)).reduce((sum, p) => sum + p.amount, 0);

    const { data: employees, error: employeesError } = await supabase.from("employees").select("id, hourly_rate");
    if (employeesError) throw employeesError;
    const rateByEmployee = new Map((employees ?? []).map((e) => [e.id, e.hourly_rate ?? 0]));

    const { data: timeEntries, error: timeEntriesError } = await supabase
      .from("time_entries")
      .select("employee_id, regular_hours, clock_in, clock_out, work_date")
      .gte("work_date", monthStartStr)
      .lte("work_date", today);
    if (timeEntriesError) throw timeEntriesError;

    const totalPaidHoursMonth = (timeEntries ?? []).reduce((sum, entry) => sum + hoursForTimeEntry(entry), 0);
    const laborCostMonth = (timeEntries ?? []).reduce(
      (sum, entry) => sum + calcLaborCost(hoursForTimeEntry(entry), rateByEmployee.get(entry.employee_id) ?? 0),
      0,
    );

    const [invoicesResult, quotesResponse, pendingQuotesResult] = await Promise.all([
      supabase.from("invoices").select("total, amount_paid, status, client_id"),
      supabase.from("quotes").select("status, accepted_at, declined_at, client_id").gte("created_at", monthStartStr),
      // Not date-scoped — an estimate sent last month and still awaiting a decision is still pending today.
      supabase.from("quotes").select("total, client_id").eq("status", "sent"),
    ]);

    for (const result of [invoicesResult, quotesResponse, pendingQuotesResult]) if (result.error) throw result.error;

    // Void invoices are cancelled debt, not outstanding receivables.
    const nonDraftInvoices = (invoicesResult.data ?? []).filter(
      (i) => i.status !== "draft" && i.status !== "void" && !demoClientIds.has(i.client_id),
    );
    const accountsReceivable = nonDraftInvoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.total - inv.amount_paid),
      0,
    );
    const outstandingInvoiceCount = nonDraftInvoices.filter((inv) => inv.total - inv.amount_paid > 0).length;

    const decidedQuotes = (quotesResponse.data ?? []).filter(
      (q) => (q.accepted_at !== null || q.declined_at !== null) && !demoClientIds.has(q.client_id),
    );
    const acceptedQuotes = decidedQuotes.filter((q) => q.accepted_at !== null);

    const pendingQuotes = (pendingQuotesResult.data ?? []).filter((q) => !demoClientIds.has(q.client_id));
    const pendingEstimatesValue = pendingQuotes.reduce((sum, q) => sum + q.total, 0);

    return {
      revenueToday,
      revenueWeek,
      revenueMonth,
      accountsReceivable,
      cashCollectedMonth,
      outstandingInvoiceCount,
      productionDollarsPerHour: productionRate(revenueMonth, totalActualHoursMonth),
      truePaidDollarsPerHour: truePaidRate(revenueMonth, totalPaidHoursMonth),
      totalPaidHoursMonth,
      laborCostMonth,
      grossProfitMonth: grossProfit(revenueMonth, laborCostMonth),
      averageTicketMonth: averageTicket(revenueMonth, completedJobs.length),
      jobsCompletedMonth: completedJobs.length,
      quoteAcceptanceRatePct: quoteAcceptanceRate(acceptedQuotes.length, decidedQuotes.length),
      crewHourTarget: DEFAULT_CREW_HOUR_TARGET,
      scheduledRevenueMonth,
      pendingEstimatesValue,
      pendingEstimatesCount: pendingQuotes.length,
    };
  });
}
