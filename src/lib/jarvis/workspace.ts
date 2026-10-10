export type ServiceCheck = {
  id: "ai" | "quickbooks" | "calendar";
  name: string;
  state: "ready" | "live" | "attention" | "setup";
  detail: string;
};
export type WorkspaceReadiness = { checkedAt: string; services: ServiceCheck[] };

/** On-demand reviews use the same authenticated tools and confirmation flow as Ask Jarvis. */
export const WORK_REVIEWS = [
  { id: "operations", name: "Operations", label: "Find my next move", description: "Today's work, open tasks and the issues worth your time.", prompt: "Run an operations review using my current owner briefing and open tasks. Give me the three most useful next actions, with source records and any missing information. Group old unfinished jobs into one issue; do not assume they were completed. Do not change or send anything." },
  { id: "collections", name: "Collections", label: "Review money owed", description: "Prioritize outstanding invoices and the next follow-up.", prompt: "Run a collections review from current invoices and overdue balances. Identify the three highest-priority accounts to review and why. Label these Homeworks/Jarvis balances, not QuickBooks-verified cash or profit. Show source records and flag uncertainty. Do not mark invoices paid or send messages." },
  { id: "sales", name: "Sales", label: "Find follow-ups", description: "Review estimates and opportunities already on the books.", prompt: "Run a sales review of my current quotes and estimates. Identify unsent drafts and unanswered estimates worth following up on, show their recorded values and source records, and give me the next step for each. If there are no recorded opportunities, say so. Do not invent leads, send messages, or change records." },
  { id: "schedule", name: "Schedule", label: "Check the week ahead", description: "Check jobs, crew coverage and gaps in the next seven days.", prompt: "Run a schedule review for the next seven days using current jobs and workload. Highlight dated appointments, missing crew assignments, conflicts and missing service details. Consult job notes before treating a zero-price appointment as unpriced paid work. Do not infer free capacity from missing assignments or assume Google Calendar has been checked. Link source records. Do not change the schedule." },
] as const;
