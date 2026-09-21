"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/data/activity-log";
import { isMissingTableError, validateNote, validateTask } from "@/lib/jarvis/notes-tasks-validation";

export type NoteTaskResult = { ok: true } | { ok: false; message: string };

const MIGRATION_MESSAGE = "Notes and tasks aren't set up yet — run supabase/job-notes-tasks-migration.sql in the Supabase SQL editor first.";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function addJobNote(jobId: string, body: string): Promise<NoteTaskResult> {
  const note = validateNote(body);
  if (!note.ok) return note;
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, message: "That job no longer exists." };

  const { data, error } = await supabase.from("job_notes").insert({ job_id: jobId, body: note.value, source: "owner", created_by: user.id }).select("id").single();
  if (error) return { ok: false, message: isMissingTableError(error) ? MIGRATION_MESSAGE : error.message };
  await logActivity({ entityType: "job", entityId: jobId, eventType: "job_note_added", summary: "Note added", detail: { note_id: data.id }, source: "owner" });
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function createTask(input: { title: string; dueDate?: string | null; notes?: string | null; jobId?: string | null }): Promise<NoteTaskResult> {
  const t = validateTask({ title: input.title, notes: input.notes, dueDate: input.dueDate });
  if (!t.ok) return t;
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { error } = await supabase
    .from("owner_tasks")
    .insert({ title: t.value.title, notes: t.value.notes, due_date: t.value.dueDate, job_id: input.jobId ?? null, source: "owner", created_by: user.id });
  if (error) return { ok: false, message: isMissingTableError(error) ? MIGRATION_MESSAGE : error.message };
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskStatus(taskId: string, status: "done" | "cancelled" | "open"): Promise<NoteTaskResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, message: "You must be signed in." };
  const { data, error } = await supabase
    .from("owner_tasks")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select("id");
  if (error) return { ok: false, message: isMissingTableError(error) ? MIGRATION_MESSAGE : error.message };
  if (!data || data.length === 0) return { ok: false, message: "That task no longer exists." };
  revalidatePath("/");
  return { ok: true };
}
