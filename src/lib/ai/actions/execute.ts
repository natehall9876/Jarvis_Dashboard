import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getJobById } from "@/lib/data/jobs";
import { getPropertyById } from "@/lib/data/properties";
import { getEmployeeById } from "@/lib/data/employees";
import { insertJob, updateJobFields, updateJobStatus } from "@/lib/actions/jobs";
import { VALID_JOB_STATUSES } from "@/lib/actions/job-constants";
import { logActivity } from "@/lib/data/activity-log";
import { isMissingTableError, validateNote, validateTask } from "@/lib/jarvis/notes-tasks-validation";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import type { ProposedAction } from "@/lib/ai/action-types";
import type { EntityReference } from "@/lib/ai/tool-types";
import type { JobInsert } from "@/types/domain";
import type { Json } from "@/types/database.types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ExecuteActionResult =
  | { ok: true; message: string; result: Record<string, unknown>; references: EntityReference[] }
  | {
      ok: false;
      reason: "auth" | "already_processed" | "stale" | "not_found" | "invalid" | "server_error";
      message: string;
    };

/**
 * In-memory "executed once" guard — the fallback when action_requests
 * (supabase/action-requests-migration.sql) hasn't been applied yet. Real
 * protection against a double-click within one running server process, but
 * it resets on restart and doesn't exist across multiple instances. Kept as
 * a fallback, not removed, so the app degrades to "single-process safe"
 * rather than "unsafe" before the migration is run.
 */
const processedActionIds = new Set<string>();

type FailureReason = "auth" | "already_processed" | "stale" | "not_found" | "invalid" | "server_error";

function fail(reason: FailureReason, message: string): ExecuteActionResult {
  return { ok: false, reason, message };
}

type ClaimOutcome = "claimed" | "already_processed" | "db_unavailable";

/**
 * Durable, cross-process idempotency: the proposed action's own id becomes
 * the primary key of a row in action_requests, so a second INSERT attempt
 * for the same id — from this process, a restarted process, or a different
 * instance entirely — fails with a real Postgres unique-violation (23505).
 * The database is the single source of truth for "has this been claimed,"
 * not process memory. Falls back to "db_unavailable" (letting the caller use
 * the in-memory guard instead) when the table doesn't exist yet — this must
 * never be the reason a legitimate action fails.
 */
async function claimActionRequest(action: ProposedAction, supabase: SupabaseServerClient): Promise<ClaimOutcome> {
  const { error } = await supabase.from("action_requests").insert({
    id: action.id,
    action_type: action.type,
    target_type: action.target?.type ?? null,
    target_id: action.target?.id ?? null,
    payload: action.payload as Json,
    snapshot: action.snapshot as Json,
    status: "executing",
  });

  if (!error) return "claimed";

  if (error.code === "23505") {
    const { data: existing } = await supabase.from("action_requests").select("status").eq("id", action.id).maybeSingle();
    if (!existing || existing.status === "executed" || existing.status === "executing") {
      return "already_processed";
    }
    // A prior attempt ended in failed/stale/cancelled/invalid — legitimate
    // to retry under the same id. `neq("status","executed")` keeps this
    // reclaim from ever overwriting a genuine success even under a race.
    const { error: reclaimError } = await supabase
      .from("action_requests")
      .update({ status: "executing", status_detail: null })
      .eq("id", action.id)
      .neq("status", "executed");
    return reclaimError ? "already_processed" : "claimed";
  }

  // Most likely "relation \"action_requests\" does not exist" — migration
  // not applied yet. Any other unexpected error also falls back rather than
  // blocking a real action on an optional durability upgrade.
  return "db_unavailable";
}

async function finalizeActionRequest(
  supabase: SupabaseServerClient,
  actionId: string,
  status: "executed" | "failed" | "stale" | "invalid" | "cancelled",
  detail?: string,
  result?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase
      .from("action_requests")
      .update({
        status,
        status_detail: detail ?? null,
        result: result ? (result as Json) : null,
        executed_at: status === "executed" ? new Date().toISOString() : null,
      })
      .eq("id", actionId);
  } catch {
    // Best-effort — the mutation itself already succeeded or failed for real
    // reasons; a failure to record that in action_requests must not change
    // the result reported to the owner.
  }
}

export async function executeProposedAction(action: ProposedAction): Promise<ExecuteActionResult> {
  const supabase = await createSupabaseServerClient();

  const claim = await claimActionRequest(action, supabase);
  if (claim === "already_processed") {
    return fail("already_processed", "This action was already executed — refresh to see the current state.");
  }
  const usingMemoryGuard = claim === "db_unavailable";
  if (usingMemoryGuard) {
    if (processedActionIds.has(action.id)) {
      return fail("already_processed", "This action was already executed — refresh to see the current state.");
    }
    processedActionIds.add(action.id);
  }

  const release = async (status: "failed" | "stale" | "invalid", detail: string) => {
    if (usingMemoryGuard) processedActionIds.delete(action.id);
    else await finalizeActionRequest(supabase, action.id, status, detail);
  };

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      await release("failed", "Not authenticated.");
      return fail("auth", "You must be signed in to confirm this action.");
    }

    let result: ExecuteActionResult;
    switch (action.type) {
      case "reschedule_job":
        result = await executeRescheduleJob(action);
        break;
      case "update_job_status":
        result = await executeUpdateJobStatus(action);
        break;
      case "assign_employee":
        result = await executeAssignEmployee(action);
        break;
      case "create_job":
        result = await executeCreateJob(action);
        break;
      case "add_job_note":
        result = await executeAddJobNote(action);
        break;
      case "create_task":
        result = await executeCreateTask(action);
        break;
      case "complete_task":
        result = await executeCompleteTask(action);
        break;
      default:
        result = fail("invalid", `Unsupported action type "${action.type as string}".`);
    }

    if (!result.ok) {
      const statusForFailure = result.reason === "stale" ? "stale" : result.reason === "invalid" || result.reason === "not_found" ? "invalid" : "failed";
      await release(statusForFailure, result.message);
    } else if (!usingMemoryGuard) {
      await finalizeActionRequest(supabase, action.id, "executed", undefined, result.result);
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong executing this action.";
    await release("failed", message);
    return fail("server_error", message);
  }
}

/** Appends a short, timestamped line to the job's existing notes — the minimal, non-invasive audit trail this phase (no schema change). */
async function appendJobAuditNote(jobId: string, line: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("jobs").select("notes").eq("id", jobId).single();
  const entry = `[Jarvis ${new Date().toISOString()}] ${line}`;
  const newNotes = data?.notes ? `${data.notes}\n${entry}` : entry;
  await supabase.from("jobs").update({ notes: newNotes }).eq("id", jobId);
}

function jobLabel(job: { property?: { client?: unknown } | null; service?: { name: string | null } | null; scheduled_date: string | null }): string {
  const client = clientDisplayName((job.property as { client?: Parameters<typeof clientDisplayName>[0] } | null)?.client);
  return `${client}${job.service?.name ? ` — ${job.service.name}` : ""}`;
}

async function executeRescheduleJob(action: ProposedAction): Promise<ExecuteActionResult> {
  const jobId = action.target?.id;
  if (!jobId) return fail("invalid", "No job specified.");

  const current = await getJobById(jobId);
  if (current.error !== null || !current.data) return fail("not_found", "That job no longer exists.");
  const job = current.data;

  const expectedUpdatedAt = action.snapshot?.updated_at;
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== job.updated_at) {
    return fail("stale", "This job changed after Jarvis proposed the reschedule — ask Jarvis to check it again before retrying.");
  }

  const newDate = action.payload.scheduled_date;
  if (typeof newDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return fail("invalid", "Proposed date is missing or malformed.");
  }
  const newTime = typeof action.payload.scheduled_start_time === "string" ? action.payload.scheduled_start_time : null;

  const oldDate = job.scheduled_date;
  await updateJobFields(jobId, { scheduled_date: newDate, scheduled_start_time: newTime });
  await appendJobAuditNote(jobId, `Rescheduled from ${oldDate ?? "unscheduled"} to ${newDate} after owner confirmation.`);
  await logActivity({
    entityType: "job",
    entityId: jobId,
    eventType: "job_rescheduled",
    summary: `${jobLabel(job)} rescheduled from ${oldDate ?? "unscheduled"} to ${newDate}`,
    detail: { from: oldDate, to: newDate, reason: action.explanation },
    source: "jarvis",
  });

  const updated = await getJobById(jobId);
  if (updated.error !== null || !updated.data) return fail("server_error", "Reschedule saved, but the job couldn't be re-read to verify.");

  return {
    ok: true,
    message: `Moved ${jobLabel(job)} to ${newDate}.`,
    result: { job_id: jobId, scheduled_date: updated.data.scheduled_date, scheduled_start_time: updated.data.scheduled_start_time },
    references: [{ type: "job", id: jobId, label: jobLabel(job) }],
  };
}

async function executeUpdateJobStatus(action: ProposedAction): Promise<ExecuteActionResult> {
  const jobId = action.target?.id;
  if (!jobId) return fail("invalid", "No job specified.");

  const current = await getJobById(jobId);
  if (current.error !== null || !current.data) return fail("not_found", "That job no longer exists.");
  const job = current.data;

  const expectedUpdatedAt = action.snapshot?.updated_at;
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== job.updated_at) {
    return fail("stale", "This job changed after Jarvis proposed the status change — ask Jarvis to check it again before retrying.");
  }

  const newStatus = action.payload.status;
  if (typeof newStatus !== "string" || !(VALID_JOB_STATUSES as readonly string[]).includes(newStatus)) {
    return fail("invalid", "Proposed status is missing or invalid.");
  }

  const oldStatus = job.status;
  await updateJobStatus(jobId, newStatus);
  await appendJobAuditNote(jobId, `Status changed from "${oldStatus}" to "${newStatus}" after owner confirmation.`);
  await logActivity({
    entityType: "job",
    entityId: jobId,
    eventType: "job_status_changed",
    summary: `${jobLabel(job)} status changed from "${oldStatus}" to "${newStatus}"`,
    detail: { from: oldStatus, to: newStatus, reason: action.explanation },
    source: "jarvis",
  });

  const updated = await getJobById(jobId);
  if (updated.error !== null || !updated.data) return fail("server_error", "Status change saved, but the job couldn't be re-read to verify.");

  return {
    ok: true,
    message: `Marked ${jobLabel(job)} as ${newStatus.replace(/_/g, " ")}.`,
    result: { job_id: jobId, status: updated.data.status },
    references: [{ type: "job", id: jobId, label: jobLabel(job) }],
  };
}

async function executeAssignEmployee(action: ProposedAction): Promise<ExecuteActionResult> {
  const jobId = action.target?.id;
  if (!jobId) return fail("invalid", "No job specified.");

  const current = await getJobById(jobId);
  if (current.error !== null || !current.data) return fail("not_found", "That job no longer exists.");
  const job = current.data;

  const expectedUpdatedAt = action.snapshot?.updated_at;
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt !== job.updated_at) {
    return fail("stale", "This job changed after Jarvis proposed the crew change — ask Jarvis to check it again before retrying.");
  }

  const employeeIds = action.payload.employee_ids;
  if (!Array.isArray(employeeIds) || !employeeIds.every((id) => typeof id === "string")) {
    return fail("invalid", "Proposed crew list is missing or malformed.");
  }

  for (const id of employeeIds) {
    const employee = await getEmployeeById(id);
    if (employee.error !== null || !employee.data) return fail("invalid", "One of the proposed employees no longer exists.");
  }

  const oldCrew = job.crew.map((c) => [c.first_name, c.last_name].filter(Boolean).join(" ")).join(", ") || "nobody";
  await updateJobFields(jobId, {}, employeeIds);

  const newCrewNames: string[] = [];
  for (const id of employeeIds) {
    const employee = await getEmployeeById(id);
    if (employee.data) newCrewNames.push([employee.data.first_name, employee.data.last_name].filter(Boolean).join(" "));
  }
  await appendJobAuditNote(jobId, `Crew changed from [${oldCrew}] to [${newCrewNames.join(", ") || "nobody"}] after owner confirmation.`);
  await logActivity({
    entityType: "job",
    entityId: jobId,
    eventType: "job_crew_changed",
    summary: `${jobLabel(job)} crew changed from [${oldCrew}] to [${newCrewNames.join(", ") || "nobody"}]`,
    detail: { from: oldCrew, to: newCrewNames, reason: action.explanation },
    source: "jarvis",
  });

  return {
    ok: true,
    message: `${jobLabel(job)} is now assigned to ${newCrewNames.join(", ") || "nobody"}.`,
    result: { job_id: jobId, crew: newCrewNames },
    references: [
      { type: "job", id: jobId, label: jobLabel(job) },
      ...employeeIds.map((id, i) => ({ type: "employee" as const, id, label: newCrewNames[i] ?? "Employee" })),
    ],
  };
}

async function executeCreateJob(action: ProposedAction): Promise<ExecuteActionResult> {
  const propertyId = action.payload.property_id;
  if (typeof propertyId !== "string") return fail("invalid", "No property specified.");

  const property = await getPropertyById(propertyId);
  if (property.error !== null || !property.data) return fail("not_found", "That property no longer exists.");

  const scheduledDate = typeof action.payload.scheduled_date === "string" ? action.payload.scheduled_date : null;
  if (scheduledDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return fail("invalid", "Proposed date is malformed.");
  }
  const price = typeof action.payload.price === "number" ? action.payload.price : null;
  const employeeIds = Array.isArray(action.payload.employee_ids)
    ? action.payload.employee_ids.filter((id): id is string => typeof id === "string")
    : [];

  const status = action.payload.status === "completed" ? "completed" : "scheduled";
  const completedAt = typeof action.payload.completed_at === "string" ? action.payload.completed_at : null;

  const fields: JobInsert = {
    property_id: propertyId,
    service_id: typeof action.payload.service_id === "string" ? action.payload.service_id : null,
    scheduled_date: scheduledDate,
    scheduled_start_time: typeof action.payload.scheduled_start_time === "string" ? action.payload.scheduled_start_time : null,
    price,
    budgeted_hours: typeof action.payload.budgeted_hours === "number" ? action.payload.budgeted_hours : null,
    actual_hours: typeof action.payload.actual_hours === "number" ? action.payload.actual_hours : null,
    notes: typeof action.payload.notes === "string" ? action.payload.notes : null,
    completion_notes: typeof action.payload.completion_notes === "string" ? action.payload.completion_notes : null,
    completed_at: status === "completed" ? completedAt : null,
    status,
  };

  const jobId = await insertJob(fields, employeeIds);
  await appendJobAuditNote(jobId, status === "completed" ? "Logged as completed work by owner confirmation via Jarvis." : "Created by owner confirmation via Jarvis.");
  await logActivity({
    entityType: "job",
    entityId: jobId,
    eventType: "job_created",
    summary: `${status === "completed" ? "Completed job logged" : "Job created"} for ${clientDisplayName(property.data.client)} — ${propertyAddress(property.data.property)}`,
    detail: { property_id: propertyId, scheduled_date: scheduledDate, price, status, reason: action.explanation },
    source: "jarvis",
  });

  const created = await getJobById(jobId);
  if (created.error !== null || !created.data) return fail("server_error", "Job saved, but couldn't be re-read to verify.");

  const label = `${clientDisplayName(property.data.client)} — ${propertyAddress(property.data.property)}`;
  return {
    ok: true,
    message:
      status === "completed"
        ? `Logged completed work for ${label}${scheduledDate ? ` on ${scheduledDate}` : ""}${price !== null ? ` — $${price}` : ""}.`
        : `Created a new job for ${label}${scheduledDate ? ` on ${scheduledDate}` : ""}.`,
    result: { job_id: jobId, scheduled_date: created.data.scheduled_date, price: created.data.price, status: created.data.status },
    references: [
      { type: "job", id: jobId, label },
      { type: "property", id: propertyId, label: propertyAddress(property.data.property) },
    ],
  };
}

const MIGRATION_MESSAGE = "Notes and tasks aren't set up yet — run supabase/job-notes-tasks-migration.sql in the Supabase SQL editor first.";

async function executeAddJobNote(action: ProposedAction): Promise<ExecuteActionResult> {
  const jobId = action.target?.id;
  if (!jobId) return fail("invalid", "No job specified.");
  const note = validateNote(action.payload.note);
  if (!note.ok) return fail("invalid", note.message);

  const current = await getJobById(jobId);
  if (current.error !== null || !current.data) return fail("not_found", "That job no longer exists.");
  const job = current.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: inserted, error } = await supabase
    .from("job_notes")
    .insert({ job_id: jobId, body: note.value, source: "voice", created_by: user?.id ?? null })
    .select("id, body")
    .single();
  if (error) return fail("server_error", isMissingTableError(error) ? MIGRATION_MESSAGE : error.message);

  // Verify by reading the row back rather than trusting the insert's return.
  const { data: verify } = await supabase.from("job_notes").select("id").eq("id", inserted.id).maybeSingle();
  if (!verify) return fail("server_error", "The note was submitted but couldn't be read back to verify.");

  await logActivity({
    entityType: "job",
    entityId: jobId,
    eventType: "job_note_added",
    summary: `Note added to ${jobLabel(job)}`,
    detail: { note_id: inserted.id },
    source: "jarvis",
  });
  return {
    ok: true,
    message: `Added the note to ${jobLabel(job)}.`,
    result: { job_id: jobId, note_id: inserted.id },
    references: [{ type: "job", id: jobId, label: jobLabel(job) }],
  };
}

async function executeCreateTask(action: ProposedAction): Promise<ExecuteActionResult> {
  const validated = validateTask({ title: action.payload.title, notes: action.payload.notes, dueDate: action.payload.due_date });
  if (!validated.ok) return fail("invalid", validated.message);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const jobId = typeof action.payload.job_id === "string" ? action.payload.job_id : null;
  const { data: inserted, error } = await supabase
    .from("owner_tasks")
    .insert({
      title: validated.value.title,
      notes: validated.value.notes,
      due_date: validated.value.dueDate,
      job_id: jobId,
      source: "voice",
      created_by: user?.id ?? null,
    })
    .select("id, title")
    .single();
  if (error) return fail("server_error", isMissingTableError(error) ? MIGRATION_MESSAGE : error.message);

  const { data: verify } = await supabase.from("owner_tasks").select("id, status").eq("id", inserted.id).maybeSingle();
  if (!verify) return fail("server_error", "The task was submitted but couldn't be read back to verify.");

  // The task row carries who/when/how (created_by, created_at, source); only job-linked tasks also get a job timeline entry.
  if (jobId) {
    await logActivity({
      entityType: "job",
      entityId: jobId,
      eventType: "task_created",
      summary: `Task created: ${inserted.title}`,
      detail: { task_id: inserted.id, due_date: validated.value.dueDate },
      source: "jarvis",
    });
  }
  return {
    ok: true,
    message: `Added task "${inserted.title}"${validated.value.dueDate ? ` due ${validated.value.dueDate}` : ""}.`,
    result: { task_id: inserted.id },
    references: [],
  };
}

async function executeCompleteTask(action: ProposedAction): Promise<ExecuteActionResult> {
  const taskId = typeof action.payload.task_id === "string" ? action.payload.task_id : null;
  if (!taskId) return fail("invalid", "No task specified.");
  const supabase = await createSupabaseServerClient();
  const { data: task, error: readError } = await supabase.from("owner_tasks").select("id, title, status").eq("id", taskId).maybeSingle();
  if (readError) return fail("server_error", isMissingTableError(readError) ? MIGRATION_MESSAGE : readError.message);
  if (!task) return fail("not_found", "That task no longer exists.");
  if (task.status !== "open") return fail("stale", `That task is already ${task.status}.`);

  const { data: updated, error } = await supabase
    .from("owner_tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("status", "open")
    .select("id, status");
  if (error) return fail("server_error", error.message);
  if (!updated || updated.length === 0 || updated[0].status !== "done") return fail("stale", "The task changed before it could be completed.");
  return { ok: true, message: `Marked "${task.title}" done.`, result: { task_id: taskId }, references: [] };
}
