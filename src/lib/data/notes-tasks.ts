import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isMissingTableError } from "@/lib/jarvis/notes-tasks-validation";

export type JobNote = { id: string; createdAt: string; body: string; source: string };
export type OwnerTask = {
  id: string;
  createdAt: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: string;
  source: string;
  jobId: string | null;
};

/** `needsMigration` distinguishes "the tables don't exist yet" from a genuine empty list or a real error. */
export type ListResult<T> = { data: T[]; error: string | null; needsMigration: boolean };

const EMPTY = <T>(over: Partial<ListResult<T>> = {}): ListResult<T> => ({ data: [], error: null, needsMigration: false, ...over });

export async function getJobNotes(jobId: string): Promise<ListResult<JobNote>> {
  if (!isSupabaseConfigured()) return EMPTY({ error: "Supabase is not configured." });
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("job_notes").select("id, created_at, body, source").eq("job_id", jobId).order("created_at", { ascending: false });
    if (error) return isMissingTableError(error) ? EMPTY({ needsMigration: true }) : EMPTY({ error: error.message });
    return EMPTY({ data: (data ?? []).map((n) => ({ id: n.id, createdAt: n.created_at, body: n.body, source: n.source })) });
  } catch (err) {
    return EMPTY({ error: err instanceof Error ? err.message : "Couldn't load notes." });
  }
}

export async function getOpenTasks(limit = 50): Promise<ListResult<OwnerTask>> {
  if (!isSupabaseConfigured()) return EMPTY({ error: "Supabase is not configured." });
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("owner_tasks")
      .select("id, created_at, title, notes, due_date, status, source, job_id")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) return isMissingTableError(error) ? EMPTY({ needsMigration: true }) : EMPTY({ error: error.message });
    return EMPTY({
      data: (data ?? []).map((t) => ({ id: t.id, createdAt: t.created_at, title: t.title, notes: t.notes, dueDate: t.due_date, status: t.status, source: t.source, jobId: t.job_id })),
    });
  } catch (err) {
    return EMPTY({ error: err instanceof Error ? err.message : "Couldn't load tasks." });
  }
}
