"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, optionalNumber, requiredNumber, withError, runMutation } from "./shared";
import { VALID_JOB_STATUSES } from "./job-constants";
import { logActivity } from "@/lib/data/activity-log";
import type { JobInsert, JobUpdate } from "@/types/domain";

function jobFieldsFromForm(formData: FormData): JobInsert {
  return {
    property_id: requiredString(formData, "property_id"),
    service_id: optionalString(formData, "service_id"),
    route_id: optionalString(formData, "route_id"),
    scheduled_date: optionalString(formData, "scheduled_date"),
    scheduled_start_time: optionalString(formData, "scheduled_start_time"),
    status: optionalString(formData, "status") ?? "scheduled",
    price: requiredNumber(formData, "price"),
    budgeted_hours: optionalNumber(formData, "budgeted_hours"),
    actual_hours: optionalNumber(formData, "actual_hours"),
    crew_size: optionalNumber(formData, "crew_size"),
    notes: optionalString(formData, "notes"),
    completion_notes: optionalString(formData, "completion_notes"),
  };
}

function selectedEmployeeIds(formData: FormData): string[] {
  return formData.getAll("employee_ids").map(String).filter(Boolean);
}

/**
 * Pure mutation helpers with no FormData/redirect dependency — the single
 * implementation both the human-facing form actions below AND the Jarvis
 * write-action executor (lib/ai/actions/execute.ts) call. Adding a second,
 * separate mutation path for AI-driven writes would risk the two drifting
 * apart (e.g. one syncing crew correctly, one not); instead there is
 * exactly one way jobs get created/rescheduled/reassigned/status-changed.
 */
export async function syncJobCrew(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
  employeeIds: string[],
) {
  const { error: deleteError } = await supabase.from("job_employees").delete().eq("job_id", jobId);
  if (deleteError) throw deleteError;
  if (employeeIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("job_employees")
    .insert(employeeIds.map((employee_id) => ({ job_id: jobId, employee_id })));
  if (insertError) throw insertError;
}

export async function insertJob(fields: JobInsert, employeeIds: string[]): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("jobs").insert(fields).select("id").single();
  if (error) throw error;
  await syncJobCrew(supabase, data.id, employeeIds);
  return data.id as string;
}

export async function updateJobFields(jobId: string, fields: JobUpdate, employeeIds?: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("jobs").update(fields).eq("id", jobId);
  if (error) throw error;
  if (employeeIds !== undefined) await syncJobCrew(supabase, jobId, employeeIds);
}

export async function updateJobStatus(jobId: string, status: string): Promise<void> {
  if (!(VALID_JOB_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status.");
  const patch: JobUpdate = { status };
  const nowIso = new Date().toISOString();
  if (status === "in_progress") patch.started_at = nowIso;
  if (status === "completed") patch.completed_at = nowIso;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId);
  if (error) throw error;
}

export async function createJob(formData: FormData) {
  const fields = jobFieldsFromForm(formData);
  const employeeIds = selectedEmployeeIds(formData);
  const result = await runMutation(async () => {
    const jobId = await insertJob(fields, employeeIds);
    await logActivity({
      entityType: "job",
      entityId: jobId,
      eventType: "job_created",
      summary: "Job created by owner",
      detail: { property_id: fields.property_id, scheduled_date: fields.scheduled_date, price: fields.price },
      source: "owner",
    });
    return jobId;
  });
  if (!result.ok) redirect(withError("/jobs?new=1", result.message));
  redirect(`/jobs/${result.data}`);
}

export async function updateJob(jobId: string, formData: FormData) {
  const fields = jobFieldsFromForm(formData);
  const employeeIds = selectedEmployeeIds(formData);
  const result = await runMutation(async () => {
    await updateJobFields(jobId, fields, employeeIds);
    await logActivity({
      entityType: "job",
      entityId: jobId,
      eventType: "job_updated",
      summary: "Job details updated by owner",
      detail: { scheduled_date: fields.scheduled_date, status: fields.status, price: fields.price },
      source: "owner",
    });
  });
  if (!result.ok) redirect(withError(`/jobs/${jobId}?edit=1`, result.message));
  redirect(`/jobs/${jobId}`);
}

export async function changeJobStatus(jobId: string, redirectTo: string, formData: FormData) {
  const status = requiredString(formData, "status");
  const result = await runMutation(async () => {
    await updateJobStatus(jobId, status);
    await logActivity({
      entityType: "job",
      entityId: jobId,
      eventType: "job_status_changed",
      summary: `Job status changed to "${status}" by owner`,
      detail: { to: status },
      source: "owner",
    });
  });
  if (!result.ok) redirect(withError(redirectTo, result.message));
  redirect(redirectTo);
}
