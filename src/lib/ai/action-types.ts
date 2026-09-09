/**
 * Foundation for a future confirmed-write-action system. Nothing in this
 * phase constructs, returns, or executes a ProposedAction — Jarvis is
 * strictly read-only right now. This file exists so the next phase can add
 * write tools without inventing the shape from scratch, and so today's
 * ToolSpec/advisor loop doesn't need to change shape when that happens.
 *
 * Intended future flow:
 *   1. A write tool (e.g. "reschedule_job") is called like any other tool,
 *      but instead of mutating data it validates the request and returns a
 *      ToolExecutionResult whose `data` is a ProposedAction.
 *   2. The advisor loop recognizes a ProposedAction in a tool result and
 *      stops the turn there (does NOT keep looping for a final text answer)
 *      so the UI can render the exact proposed change.
 *   3. The owner explicitly confirms in the UI, which calls a *separate*,
 *      dedicated endpoint — not another advisor turn — that re-validates
 *      and performs the real `lib/actions/*` mutation under the same
 *      authenticated/RLS-scoped Supabase client the rest of the app uses.
 *   4. The result of that mutation is verified (re-read the record) and
 *      reported back, rather than assumed to have succeeded.
 *
 * This keeps "the model decided to act" and "the mutation actually ran"
 * as two separate, explicitly-confirmed steps — the model never gets a
 * tool that mutates data directly.
 */

export type ProposedActionType =
  | "create_job"
  | "reschedule_job"
  | "assign_employee"
  | "mark_job_complete"
  | "create_quote"
  | "create_invoice"
  | "update_client"
  | "draft_customer_message";

export type ProposedAction = {
  kind: "proposed_action";
  type: ProposedActionType;
  /** Short, owner-facing description of exactly what would change. */
  summary: string;
  /** The entity this action would apply to, if it already exists. */
  target: { type: "job" | "client" | "quote" | "invoice" | "property"; id: string } | null;
  /** The exact field changes or creation payload, shown to the owner before confirmation — never applied sight-unseen. */
  proposedChanges: Record<string, unknown>;
};
