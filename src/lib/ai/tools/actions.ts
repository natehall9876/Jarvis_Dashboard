import { randomUUID } from "crypto";
import { getJobById } from "@/lib/data/jobs";
import { clientDisplayName } from "@/lib/format";
import { VALID_JOB_STATUSES } from "@/lib/actions/job-constants";
import type { ProposedAction, ProposedActionType } from "@/lib/ai/action-types";
import { unwrap, type ToolSpec, type ToolExecutionResult } from "@/lib/ai/tool-types";

/**
 * These tools NEVER write to the database. Each one reads the current
 * record and returns a ProposedAction — a plain, allowlisted-shape object
 * the advisor loop recognizes and hands to the UI untouched. The owner must
 * click Confirm, which calls a separate endpoint
 * (/api/ai-advisor/execute-action) this model has no access to. See
 * lib/ai/action-types.ts for the full flow.
 *
 * Every tool here requires an exact target id, never a name or description
 * — resolving "Kim's aeration job" to one specific job_id (via get_jobs /
 * search_clients, disambiguating with the owner if more than one job could
 * match) is the model's job, done with read tools, BEFORE it ever calls one
 * of these. That split is what keeps a genuinely ambiguous request from
 * turning into a confident guess.
 */

function buildAction(input: {
  type: ProposedActionType;
  title: string;
  target: ProposedAction["target"];
  current: ProposedAction["current"];
  proposed: Record<string, unknown>;
  explanation: string;
  warnings?: string[];
  payload: Record<string, unknown>;
  snapshot: ProposedAction["snapshot"];
}): ToolExecutionResult {
  const action: ProposedAction = {
    kind: "proposed_action",
    id: randomUUID(),
    type: input.type,
    title: input.title,
    target: input.target,
    current: input.current,
    proposed: input.proposed,
    explanation: input.explanation,
    warnings: input.warnings ?? [],
    requiresConfirmation: true,
    payload: input.payload,
    snapshot: input.snapshot,
    createdAt: new Date().toISOString(),
  };
  return { data: action };
}

export const actionTools: ToolSpec[] = [
  {
    name: "propose_reschedule_job",
    description:
      "Prepare a proposed date/time change for ONE specific job — this does NOT move it. The owner must confirm the card that appears before anything changes. Only call this once you have a single, confirmed job_id (from get_jobs, get_job_details, or page context) — never guess between multiple candidate jobs.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The exact job UUID to reschedule." },
        new_date: { type: "string", description: "New scheduled date, ISO YYYY-MM-DD." },
        new_time: { type: "string", description: "Optional new start time, HH:MM 24-hour. Omit to keep the current time." },
        reason: { type: "string", description: "Optional short reason, shown to the owner (e.g. 'requested by owner', 'rained out')." },
      },
      required: ["job_id", "new_date"],
    },
    execute: async (input) => {
      const jobId = String(input.job_id);
      const result = await getJobById(jobId);
      return unwrap(result, (job) => {
        if (!job) return { data: { error: "That job doesn't exist — it may have been deleted, or the id may be wrong." } };
        const newDate = String(input.new_date);
        const newTime = typeof input.new_time === "string" ? input.new_time : job.scheduled_start_time;
        const title = `Reschedule ${clientDisplayName(job.property?.client)} — ${job.service?.name ?? "Job"}`;
        const warnings: string[] = [];
        if (job.status === "completed") warnings.push("This job is already marked completed.");
        if (job.status === "cancelled") warnings.push("This job is cancelled.");
        return buildAction({
          type: "reschedule_job",
          title,
          target: { type: "job", id: jobId },
          current: { scheduled_date: job.scheduled_date, scheduled_start_time: job.scheduled_start_time },
          proposed: { scheduled_date: newDate, scheduled_start_time: newTime },
          explanation: typeof input.reason === "string" ? input.reason : "Requested by owner.",
          warnings,
          payload: { job_id: jobId, scheduled_date: newDate, scheduled_start_time: newTime },
          snapshot: { updated_at: job.updated_at },
        });
      });
    },
  },
  {
    name: "propose_update_job_status",
    description:
      "Prepare a proposed status change for ONE specific job (e.g. mark it completed, in progress, cancelled, or skipped) — this does NOT change it. The owner must confirm first. Only call this with a single, confirmed job_id.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The exact job UUID." },
        new_status: { type: "string", enum: [...VALID_JOB_STATUSES], description: "The proposed new status." },
        reason: { type: "string", description: "Optional short reason shown to the owner." },
      },
      required: ["job_id", "new_status"],
    },
    execute: async (input) => {
      const jobId = String(input.job_id);
      const newStatus = String(input.new_status);
      if (!(VALID_JOB_STATUSES as readonly string[]).includes(newStatus)) {
        return { data: { error: `"${newStatus}" is not a valid job status.` } };
      }
      const result = await getJobById(jobId);
      return unwrap(result, (job) => {
        if (!job) return { data: { error: "That job doesn't exist — it may have been deleted, or the id may be wrong." } };
        const title = `Mark ${clientDisplayName(job.property?.client)} — ${job.service?.name ?? "Job"} as ${newStatus.replace(/_/g, " ")}`;
        const warnings: string[] = [];
        if (job.status === "completed" && newStatus !== "completed") warnings.push("This reverts a job that's already marked completed.");
        return buildAction({
          type: "update_job_status",
          title,
          target: { type: "job", id: jobId },
          current: { status: job.status },
          proposed: { status: newStatus },
          explanation: typeof input.reason === "string" ? input.reason : "Requested by owner.",
          warnings,
          payload: { job_id: jobId, status: newStatus },
          snapshot: { updated_at: job.updated_at },
        });
      });
    },
  },
];
