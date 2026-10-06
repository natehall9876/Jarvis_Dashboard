import { getAttentionItems, type AttentionReport } from "@/lib/data/attention";
import { getOwnerBriefing } from "@/lib/data/owner-briefing";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

function firstActions(report: AttentionReport) {
  return { ...report, items: report.items.slice(0, 8), omitted_count: Math.max(0, report.items.length - 8) };
}

export const attentionTools: ToolSpec[] = [
  {
    name: "get_owner_briefing",
    description:
      "The single best first call for 'give me my owner briefing', 'morning briefing', or any broad 'how's the business doing' question. Returns today's schedule, a ranked list of everything needing attention (overdue invoices, unpaid customers with upcoming work, stale quotes, unfinished past jobs, equipment issues, overloaded days), and the current business-pulse financial metrics — all in one call. Build your answer around this instead of calling get_today_snapshot, get_attention_items, and get_business_pulse separately.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getOwnerBriefing();
      return unwrap(result, (briefing) => ({
        data: { ...briefing, attention: firstActions(briefing.attention) },
        references: [
          ...briefing.today.jobs.map((j) => ({ type: "job" as const, id: j.id, label: j.client })),
          ...briefing.attention.items.slice(0, 8).flatMap((i) => (i.reference ? [i.reference] : [])),
        ].slice(0, 12),
      }));
    },
  },
  {
    name: "get_attention_items",
    description:
      "A ranked (critical/warning/info) list of concrete operational issues worth the owner's attention right now: overdue invoices, unpaid customers with upcoming work, quotes sitting unanswered, jobs stuck unfinished from a past date, equipment problems, and overloaded upcoming days. Use for 'what needs my attention', 'what am I forgetting', or 'what's the biggest problem right now' — do not use get_today_snapshot alone for these, it only covers today.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getAttentionItems();
      return unwrap(result, (report) => ({
        data: firstActions(report),
        references: report.items.slice(0, 8).flatMap((i) => (i.reference ? [i.reference] : [])),
      }));
    },
  },
];
