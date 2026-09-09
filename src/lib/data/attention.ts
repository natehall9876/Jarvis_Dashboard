import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import { getOverdueInvoices } from "@/lib/data/invoices";
import { getEquipment } from "@/lib/data/equipment";
import { getWorkloadSummary } from "@/lib/data/jobs";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import type { DataResult, JobWithRelations, QuoteWithItems } from "@/types/domain";

export type AttentionSeverity = "critical" | "warning" | "info";

export type AttentionItem = {
  severity: AttentionSeverity;
  category: string;
  summary: string;
  reference: { type: "invoice" | "client" | "job" | "quote" | "equipment"; id: string; label: string } | null;
};

export type AttentionReport = {
  items: AttentionItem[];
  critical_count: number;
  warning_count: number;
  info_count: number;
};

const QUOTE_FOLLOW_UP_AFTER_DAYS = 3;
const WORKLOAD_LOOKAHEAD_DAYS = 6;

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Deterministic, rules-based scan for things a real operator would want
 * flagged — the same "not an LLM call" philosophy as Command Center's
 * priorities list, but broader: it looks across receivables, quotes,
 * unfinished past work, equipment, and near-term schedule load in one pass.
 * This is what backs both the `get_attention_items` tool and the owner
 * briefing, so "what needs my attention" gives the same grounded answer
 * whether asked directly or folded into a briefing.
 */
export async function getAttentionItems(): Promise<DataResult<AttentionReport>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const today = toISODate(new Date());
    const lookaheadEnd = toISODate(new Date(Date.now() + WORKLOAD_LOOKAHEAD_DAYS * 86_400_000));

    const [overdueResult, equipmentResult, quotesResp, unfinishedResp, workloadResult] = await Promise.all([
      getOverdueInvoices(20),
      getEquipment(),
      supabase
        .from("quotes")
        .select(`*, client:clients(id, first_name, last_name, company_name), items:quote_items(*)`)
        .eq("status", "sent"),
      supabase
        .from("jobs")
        .select(`*, property:properties(*, client:clients(id, first_name, last_name, company_name)), service:services(id, name)`)
        .lt("scheduled_date", today)
        .in("status", ["scheduled", "in_progress"]),
      getWorkloadSummary(today, lookaheadEnd),
    ]);

    const items: AttentionItem[] = [];

    // Overdue invoices — the clearest, most actionable receivables signal.
    const overdueInvoices = overdueResult.data ?? [];
    for (const inv of overdueInvoices) {
      items.push({
        severity: inv.days_overdue > 14 ? "critical" : "warning",
        category: "overdue_invoice",
        summary: `${clientDisplayName(inv.client)} owes $${inv.balance.toLocaleString()} on invoice #${inv.invoice_number} — ${inv.days_overdue} day${inv.days_overdue === 1 ? "" : "s"} overdue.`,
        reference: { type: "invoice", id: inv.id, label: `#${inv.invoice_number}` },
      });
    }

    // Unpaid customers with work already on the books — worth mentioning at
    // the job site rather than chasing separately. Fetched as one unfiltered
    // upcoming-jobs query and matched against overdue clients in memory,
    // rather than relying on PostgREST embedded-resource filter syntax.
    if (overdueInvoices.length > 0) {
      const clientIds = new Set(overdueInvoices.map((i) => i.client?.id).filter((id): id is string => !!id));
      const { data: upcomingJobs } = await supabase
        .from("jobs")
        .select(`scheduled_date, property:properties(client_id)`)
        .gte("scheduled_date", today)
        .neq("status", "cancelled");

      const nextDateByClient = new Map<string, string>();
      for (const row of (upcomingJobs ?? []) as unknown as { scheduled_date: string | null; property: { client_id: string } | null }[]) {
        const clientId = row.property?.client_id;
        if (!clientId || !row.scheduled_date || !clientIds.has(clientId)) continue;
        const existing = nextDateByClient.get(clientId);
        if (!existing || row.scheduled_date < existing) nextDateByClient.set(clientId, row.scheduled_date);
      }

      for (const inv of overdueInvoices) {
        const clientId = inv.client?.id;
        const nextDate = clientId ? nextDateByClient.get(clientId) : undefined;
        if (!clientId || !nextDate) continue;
        items.push({
          severity: "warning",
          category: "unpaid_with_upcoming_work",
          summary: `${clientDisplayName(inv.client)} has a job scheduled ${nextDate} but still owes $${inv.balance.toLocaleString()} — worth collecting on-site or before the visit.`,
          reference: { type: "client" as const, id: clientId, label: clientDisplayName(inv.client) },
        });
      }
    }

    // Quotes sitting unanswered.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - QUOTE_FOLLOW_UP_AFTER_DAYS);
    const quotesNeedingFollowUp = ((quotesResp.data ?? []) as unknown as QuoteWithItems[]).filter((q) => {
      const sentAt = q.sent_at ? new Date(q.sent_at) : null;
      return sentAt !== null && sentAt <= cutoff;
    });
    for (const q of quotesNeedingFollowUp) {
      const days = q.sent_at ? Math.floor((Date.now() - new Date(q.sent_at).getTime()) / 86_400_000) : null;
      items.push({
        severity: days !== null && days > 10 ? "warning" : "info",
        category: "quote_needs_follow_up",
        summary: `${clientDisplayName(q.client)}'s $${q.total.toLocaleString()} quote (${q.quote_number ?? "quote"}) has had no response in ${days ?? "several"} days.`,
        reference: { type: "quote" as const, id: q.id, label: q.quote_number ?? "Quote" },
      });
    }

    // Jobs stuck in the past with no resolution — a real data/ops gap, not
    // just "still scheduled."
    const unfinishedJobs = (unfinishedResp.data ?? []) as unknown as JobWithRelations[];
    for (const job of unfinishedJobs) {
      items.push({
        severity: "warning",
        category: "unfinished_past_job",
        summary: `${clientDisplayName(job.property?.client)}'s job at ${propertyAddress(job.property)} on ${job.scheduled_date} is still "${job.status}" — confirm it happened and close it out.`,
        reference: { type: "job" as const, id: job.id, label: `${clientDisplayName(job.property?.client)} — ${job.scheduled_date ?? ""}` },
      });
    }

    // Equipment out of service or due for maintenance.
    const equipmentIssues = (equipmentResult.data ?? []).filter((e) => e.status !== "active" || e.maintenance_warning);
    for (const e of equipmentIssues) {
      items.push({
        severity: e.status === "out_of_service" ? "critical" : "info",
        category: "equipment_issue",
        summary: `${e.name} is ${e.status === "active" ? "flagged for maintenance" : (e.status ?? "unknown").replace(/_/g, " ")}${e.maintenance_due_date ? ` (due ${e.maintenance_due_date})` : ""}.`,
        reference: { type: "equipment" as const, id: e.id, label: e.name },
      });
    }

    // Overloaded near-term days — only when there's crew data to judge by,
    // otherwise a workload number alone can't support an "overloaded" claim.
    const workload = workloadResult.data;
    if (workload) {
      for (const day of workload.days) {
        if (day.crew_assigned.length === 0) continue;
        const hoursPerCrew = day.budgeted_hours / day.crew_assigned.length;
        if (hoursPerCrew > 8) {
          items.push({
            severity: "warning",
            category: "overloaded_day",
            summary: `${day.date} has ${day.budgeted_hours.toFixed(1)} budgeted hours across ${day.crew_assigned.length} crew (~${hoursPerCrew.toFixed(1)}h/person) — likely overloaded.`,
            reference: null,
          });
        }
      }
    }

    const severityRank: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    return {
      items,
      critical_count: items.filter((i) => i.severity === "critical").length,
      warning_count: items.filter((i) => i.severity === "warning").length,
      info_count: items.filter((i) => i.severity === "info").length,
    };
  });
}
