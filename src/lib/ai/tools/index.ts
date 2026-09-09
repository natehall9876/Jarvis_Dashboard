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
import type { ToolSpec } from "@/lib/ai/tool-types";

/**
 * The complete read-only business tool registry Jarvis can call. Every tool
 * here wraps an existing `lib/data/*` query (so it goes through the same
 * authenticated Supabase client and RLS policies as the rest of the app —
 * there is no service-role bypass and no separate data path) and returns a
 * compact, model-shaped projection rather than raw table rows.
 *
 * This registry is intentionally flat and read-only. Nothing here calls
 * .insert()/.update()/.delete(). A future write tool (e.g. "reschedule_job")
 * would follow the same ToolSpec shape but with two differences: its
 * `execute` would return a `{ requiresConfirmation: true, summary }` result
 * instead of performing the mutation immediately, and the advisor loop in
 * advisor.ts would surface that to the UI for an explicit owner confirmation
 * before a second call actually runs the corresponding `lib/actions/*`
 * mutation. Nothing in this phase performs that second call.
 */
export const ALL_TOOLS: ToolSpec[] = [
  ...businessTools,
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
