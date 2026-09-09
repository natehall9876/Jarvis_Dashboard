import { getTodaysMission, getBusinessPulse } from "@/lib/data/command-center";
import { getReportsSummary } from "@/lib/data/reports";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const businessTools: ToolSpec[] = [
  {
    name: "get_today_snapshot",
    description:
      "Today's complete operational picture in one call: every job scheduled today (with client/property/service/status), expected revenue, budgeted hours, crew working, routes running, quotes overdue for follow-up, overdue invoices, and equipment issues. This is the right first call for 'what's today look like', 'give me a morning briefing', or 'what should I focus on' questions.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getTodaysMission();
      return unwrap(result, (mission) => ({
        data: {
          date: mission.date,
          job_count: mission.jobCount,
          expected_revenue: mission.expectedRevenue,
          budgeted_hours: mission.budgetedHours,
          crew_working: mission.crewWorking.map((c) => c.name),
          routes_running: mission.routesRunning.length,
          jobs: mission.jobs.map((j) => ({
            id: j.id,
            client: clientDisplayName(j.property?.client),
            property: propertyAddress(j.property),
            service: j.service?.name ?? null,
            status: j.status,
            price: j.price,
            scheduled_start_time: j.scheduled_start_time,
          })),
          schedule_changes_today: mission.scheduleChanges.length,
          quotes_needing_follow_up: mission.quotesNeedingFollowUp.map((q) => ({
            id: q.id,
            quote_number: q.quote_number,
            client: clientDisplayName(q.client),
            total: q.total,
            sent_at: q.sent_at,
          })),
          overdue_invoices: mission.overdueInvoices.map((i) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            client: clientDisplayName(i.client),
            balance: i.balance,
            days_overdue: i.days_overdue,
          })),
          equipment_issues: mission.equipmentIssues.map((e) => ({ id: e.id, name: e.name, status: e.status })),
        },
        references: [
          ...mission.jobs.map((j) => ({ type: "job" as const, id: j.id, label: clientDisplayName(j.property?.client) })),
          ...mission.overdueInvoices.map((i) => ({ type: "invoice" as const, id: i.id, label: `#${i.invoice_number}` })),
          ...mission.quotesNeedingFollowUp.map((q) => ({ type: "quote" as const, id: q.id, label: q.quote_number ?? "Quote" })),
          ...mission.equipmentIssues.map((e) => ({ type: "equipment" as const, id: e.id, label: e.name })),
        ],
      }));
    },
  },
  {
    name: "get_business_pulse",
    description:
      "Deterministic revenue and profitability metrics: revenue today/this-week/this-month, accounts receivable, cash collected this month, production $/hour, labor cost this month, gross profit this month, average ticket, jobs completed this month, and quote acceptance rate. Any field that can't be reliably calculated from recorded data comes back as null — report that honestly rather than guessing.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getBusinessPulse();
      return unwrap(result, (pulse) => ({ data: pulse }));
    },
  },
  {
    name: "get_reports_summary",
    description:
      "Deterministic trailing-window business report: total revenue, total labor cost, labor cost %, jobs completed, quote acceptance rate, plus revenue broken down by service type, by client (top 10), and by route — each with job count and $/hour where hours data exists. Use for 'which clients generate the most revenue', 'which service is most profitable', or 'which route is underperforming'.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "string", description: "Trailing window size in days (default 90)." },
      },
    },
    execute: async (input) => {
      const days = typeof input.days === "string" ? Number(input.days) : typeof input.days === "number" ? input.days : 90;
      const result = await getReportsSummary(Number.isFinite(days) && days > 0 ? days : 90);
      return unwrap(result, (summary) => ({
        data: summary,
        references: [
          ...summary.byClient.map((c) => ({ type: "client" as const, id: c.clientId, label: c.clientName })),
          ...summary.byRoute.map((r) => ({ type: "route" as const, id: r.routeId, label: r.routeName })),
        ],
      }));
    },
  },
];
