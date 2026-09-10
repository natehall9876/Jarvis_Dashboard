import { clientTools } from "@/lib/ai/tools/clients";
import { propertyTools } from "@/lib/ai/tools/properties";
import { jobTools } from "@/lib/ai/tools/jobs";
import { routeTools } from "@/lib/ai/tools/routes";
import { invoiceTools } from "@/lib/ai/tools/invoices";
import { quoteTools } from "@/lib/ai/tools/quotes";
import { employeeTools } from "@/lib/ai/tools/employees";
import { equipmentTools } from "@/lib/ai/tools/equipment";
import { expenseTools } from "@/lib/ai/tools/expenses";
import { businessTools } from "@/lib/ai/tools/business";
import { attentionTools } from "@/lib/ai/tools/attention";
import { actionTools } from "@/lib/ai/tools/actions";
import type { ToolSpec } from "@/lib/ai/tool-types";

/**
 * The complete business tool registry Jarvis can call. Every read tool here
 * wraps an existing `lib/data/*` query (so it goes through the same
 * authenticated Supabase client and RLS policies as the rest of the app —
 * there is no service-role bypass and no separate data path) and returns a
 * compact, model-shaped projection rather than raw table rows.
 *
 * The `actionTools` (propose_reschedule_job, propose_update_job_status,
 * propose_assign_employee, propose_create_job) are the only tools that touch
 * writes at all, and even they never call .insert()/.update()/.delete()
 * themselves — each one only reads the current record and returns a
 * ProposedAction (see lib/ai/action-types.ts). The advisor loop detects that
 * shape and stops the model from taking further action that turn; the real
 * mutation only happens in lib/ai/actions/execute.ts, behind a dedicated
 * /api/ai-advisor/execute-action endpoint the model has no access to, and
 * only after the owner clicks Confirm in the UI. Every other tool here
 * remains strictly read-only.
 */
export const ALL_TOOLS: ToolSpec[] = [
  ...businessTools,
  ...attentionTools,
  ...actionTools,
  ...jobTools,
  ...clientTools,
  ...propertyTools,
  ...routeTools,
  ...invoiceTools,
  ...quoteTools,
  ...employeeTools,
  ...equipmentTools,
  ...expenseTools,
];

export function findTool(name: string): ToolSpec | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function toolDefinitions() {
  return ALL_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
