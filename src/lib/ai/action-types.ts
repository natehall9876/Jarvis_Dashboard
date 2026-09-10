/**
 * Structured, allowlisted write-action contracts. This union IS the
 * allowlist — the model can only ever produce one of these four shapes
 * (via the propose_* tools in lib/ai/tools/actions.ts), and the execution
 * endpoint (lib/ai/actions/execute.ts) re-validates every field again
 * before touching the database. There is no generic "table"/"column"
 * field anywhere in this file, and there must never be one — the model
 * selects an action type, it does not describe a mutation.
 *
 * Flow: a propose_* tool reads the current record, builds a ProposedAction,
 * and returns it as a tool result. The advisor loop (advisor.ts) detects
 * `kind: "proposed_action"` in a tool result, forces the model to wrap up
 * with text only (no further tool calls that turn), and surfaces the
 * ProposedAction to the UI untouched. Nothing executes until the owner
 * clicks Confirm, which POSTs this exact object to
 * /api/ai-advisor/execute-action — a separate endpoint the model has no
 * access to.
 */

export type ProposedActionType = "reschedule_job" | "update_job_status" | "assign_employee" | "create_job";

export type ProposedActionTarget = { type: "job"; id: string };

export type ProposedAction = {
  kind: "proposed_action";
  /** Server-generated nonce. Also the idempotency key at execution time — a given id can execute at most once. */
  id: string;
  type: ProposedActionType;
  /** Short, owner-facing title, e.g. "Reschedule Sarah Delgado — Weekly Mowing". */
  title: string;
  /** The existing record this applies to, or null for create_job (nothing exists yet). */
  target: ProposedActionTarget | null;
  /** Current field values, shown struck-through/before in the UI. Null for create_job. */
  current: Record<string, unknown> | null;
  /** The values after the change — the exact thing the owner is confirming. */
  proposed: Record<string, unknown>;
  /** One or two sentences: why Jarvis is proposing this. */
  explanation: string;
  /** Anything the owner should notice before confirming (e.g. "This job is already completed."). Empty array if none. */
  warnings: string[];
  /** Always true this phase — every action type here requires explicit confirmation, no exceptions. */
  requiresConfirmation: true;
  /** Exact typed arguments the execution endpoint needs — re-validated there, never trusted blindly. */
  payload: Record<string, unknown>;
  /** Fields captured at proposal time to detect a stale/changed record at execution time (e.g. { updated_at }). Null for create_job. */
  snapshot: Record<string, unknown> | null;
  createdAt: string;
};

export function isProposedAction(value: unknown): value is ProposedAction {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "proposed_action" &&
    typeof v.id === "string" &&
    typeof v.type === "string" &&
    ["reschedule_job", "update_job_status", "assign_employee", "create_job"].includes(v.type as string) &&
    typeof v.title === "string" &&
    typeof v.proposed === "object" &&
    v.proposed !== null &&
    typeof v.payload === "object" &&
    v.payload !== null &&
    v.requiresConfirmation === true
  );
}

/**
 * Not yet implemented — documented here so the next phase extends this
 * union instead of inventing a parallel shape. Each addition needs its own
 * propose_* tool, execute() case, and confirmation-card rendering, same as
 * the four above.
 */
export type FutureProposedActionType =
  | "create_client"
  | "update_client"
  | "create_property"
  | "create_quote"
  | "create_invoice"
  | "draft_customer_message"
  | "send_customer_message"
  | "reassign_route"
  | "create_recurring_job"
  | "attach_job_photo";
