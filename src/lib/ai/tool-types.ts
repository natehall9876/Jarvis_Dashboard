import type { ToolInputSchema } from "@/lib/ai/provider";

/**
 * A record a tool touched, surfaced back to the UI so it can render an
 * actionable link — the same navigable-reference requirement as the rest of
 * the dashboard, extended to the advisor's answers.
 */
export type EntityReference = {
  type: "client" | "property" | "job" | "invoice" | "quote" | "employee" | "equipment" | "route";
  id: string;
  label: string;
};

export type ToolExecutionResult = {
  /** JSON-serializable payload handed back to the model as the tool_result content. */
  data: unknown;
  references?: EntityReference[];
};

export type ToolSpec = {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  execute: (input: Record<string, unknown>) => Promise<ToolExecutionResult>;
};

/** Every tool wraps a `lib/data` DataResult call — this turns the failure case into a model-readable message instead of throwing. */
export async function unwrap<T>(
  result: { data: T; error: null } | { data: null; error: string },
  onSuccess: (data: T) => ToolExecutionResult,
): Promise<ToolExecutionResult> {
  if (result.error !== null) {
    return { data: { error: result.error } };
  }
  return onSuccess(result.data);
}
