"use server";

import { revalidatePath } from "next/cache";
import { writeHomeworksSchedule } from "@/lib/integrations/homeworks-schedule-write";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalString, requiredString, optionalNumber, requiredNumber, withError, runMutation } from "./shared";
import { VALID_JOB_STATUSES } from "./job-constants";
import { logActivity } from "@/lib/data/activity-log";
import { getJobsForDate } from "@/lib/data/jobs";
import { todayInZone } from "@/lib/integrations/homeworks-dates";
import { clientDisplayName } from "@/lib/format";
import type { JobInsert, JobUpdate } from "@/types/domain";
import { getOwnershipRecord, isRecordHomeworksOwned, rejectOwnershipFields, requireLocalRecord, submittedFields } from "./homeworks-ownership";

function jobFieldsFromForm(formData: FormData, current?: { property_id: string; price: number | null }): JobInsert {
  return {
    property_id: formData.has("property_id") ? requiredString(formData, "property_id") : current?.property_id ?? requiredString(formData, "property_id"),
    service_id: optionalString(formData, "service_id"),
    route_id: optionalString(formData, "route_id"),
    scheduled_date: optionalString(formData, "scheduled_date"),
    scheduled_start_time: optionalString(formData, "scheduled_start_time"),
    status: optionalString(formData, "status") ?? "scheduled",
    price: current ? optionalNumber(formData, "price") : requiredNumber(formData, "price"),
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
 * executor (lib/ai/actions/execute.ts) uses for supported schedule/status
 * changes. Local creation and crew changes must verify the job and its
 * parents before writing; source jobs use Homeworks for schedule/status.
 */
export async function syncJobCrew(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
  employeeIds: string[],
) {
  await requireLocalRecord(supabase, "jobs", jobId);
  for (const employeeId of new Set(employeeIds)) await getOwnershipRecord(supabase, "employees", employeeId);
  const { error: deleteError } = await supabase.from("job_employees").delete().eq("job_id", jobId);
  if (deleteError) throw deleteError;
  if (employeeIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("job_employees")
    .insert(employeeIds.map((employee_id) => ({ job_id: jobId, employee_id })));
  if (insertError) throw insertError;
}

export async function insertJob(fields: JobInsert, employeeIds: string[]): Promise<string> {
  rejectOwnershipFields(fields);
  const supabase = await createSupabaseServerClient();
  await requireLocalRecord(supabase, "properties", fields.property_id);
  for (const employeeId of new Set(employeeIds)) await getOwnershipRecord(supabase, "employees", employeeId);
  const { data, error } = await supabase.from("jobs").insert(fields).select("id").single();
  if (error) throw error;
  await syncJobCrew(supabase, data.id, employeeIds);
  return data.id as string;
}

export async function updateJobFields(jobId: string, fields: JobUpdate, employeeIds?: string[]): Promise<void> {
  rejectOwnershipFields(fields);
  const supabase = await createSupabaseServerClient();
  const current = await getOwnershipRecord(supabase, "jobs", jobId);
  const sourceManaged = await isRecordHomeworksOwned(supabase, "jobs", current);
  const changes = Object.fromEntries(Object.entries(fields).filter(([key,value]) => {
    const before = (current as unknown as Record<string,unknown>)[key];
    if (key === "scheduled_start_time") return String(value ?? "").slice(0,5) !== String(before ?? "").slice(0,5);
    return value !== before;
  })) as JobUpdate;
  if (sourceManaged) {
    const allowed = ["scheduled_date","scheduled_start_time","status","notes","completion_notes","actual_hours"];
    for (const key of Object.keys(changes)) if (!allowed.includes(key)) throw new Error(key.replaceAll("_"," ")+" is managed in Homeworks. Update it there so the change persists.");
    if (employeeIds !== undefined) {
      const assigned = await supabase.from("job_employees").select("employee_id").eq("job_id",jobId);
      if (assigned.error) throw assigned.error;
      if (JSON.stringify((assigned.data??[]).map(e=>e.employee_id).sort()) !== JSON.stringify([...new Set(employeeIds)].sort())) throw new Error("Crew assignments are managed in Homeworks.");
    }
    const sourcePatch = Object.fromEntries(Object.entries(changes).filter(([key])=>["scheduled_date","scheduled_start_time","status"].includes(key)));
    if (Object.keys(sourcePatch).length) {
      if (!current.homeworks_id) throw new Error("This job is managed in Homeworks but has no linked visit. Update its schedule or status in Homeworks.");
      await writeHomeworksSchedule(current.homeworks_id,sourcePatch);
    }
    delete changes.scheduled_date; delete changes.scheduled_start_time; delete changes.status;
  } else {
    if (changes.property_id !== undefined) await requireLocalRecord(supabase, "properties", changes.property_id);
    if (employeeIds !== undefined) for (const employeeId of new Set(employeeIds)) await getOwnershipRecord(supabase, "employees", employeeId);
  }
  if (!sourceManaged && changes.status === "in_progress") changes.started_at = new Date().toISOString();
  if (!sourceManaged && changes.status === "completed") changes.completed_at = new Date().toISOString();
  if (Object.keys(changes).length) {
    const { data:saved, error } = await supabase.from("jobs").update(changes).eq("id",jobId).select("id").maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("Job changed or could not be saved. Refresh and retry.");
  }
  if (!sourceManaged && employeeIds !== undefined) await syncJobCrew(supabase,jobId,employeeIds);
  revalidatePath("/schedule"); revalidatePath("/"); revalidatePath("/jobs"); revalidatePath("/jobs/"+jobId);
}

export async function updateJobStatus(jobId: string, status: string): Promise<void> {
  if (!(VALID_JOB_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status.");
  await updateJobFields(jobId, {status});
}

export async function createJob(formData: FormData) {
  const fields = jobFieldsFromForm(formData);
  const employeeIds = selectedEmployeeIds(formData);
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
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
  const result = await runMutation(async () => {
    rejectOwnershipFields(formData);
    const supabase = await createSupabaseServerClient();
    const current = await getOwnershipRecord(supabase, "jobs", jobId);
    const fields = submittedFields(formData, jobFieldsFromForm(formData, current));
    const sourceManaged = await isRecordHomeworksOwned(supabase, "jobs", current);
    const employeeIds = formData.has("employee_ids") || !sourceManaged ? selectedEmployeeIds(formData) : undefined;
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

export type FirstJobTodayResult = { ok: true; job: { id: string; label: string } | null } | { ok: false; message: string };

/**
 * Backs the voice command "open the first job" (see
 * lib/jarvis/voice-utils.ts's FIRST_JOB intent). Resolves against the EXACT
 * same query and ordering the Schedule page itself uses for its day view
 * (getJobsForDate -> getJobs, using source or saved route order) — "first" means whatever a human
 * looking at today's Schedule page would call the first job, not a
 * separate, possibly-inconsistent definition. `job: null` (not an error)
 * when today genuinely has no jobs — never invents one.
 */
export async function getFirstJobToday(): Promise<FirstJobTodayResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { data: jobs, error } = await getJobsForDate(todayInZone());
  if (error) return { ok: false, message: error };
  if (!jobs || jobs.length === 0) return { ok: true, job: null };

  const first = jobs[0];
  const label = `${first.service?.name ?? "Job"} for ${clientDisplayName(first.property?.client)}`;
  return { ok: true, job: { id: first.id, label } };
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
