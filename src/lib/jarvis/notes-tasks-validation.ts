/**
 * Pure validation for owner-entered job notes and tasks. Shared by the form
 * actions and by the Jarvis executor, so a spoken command and a typed form are
 * held to exactly the same rules. Database constraints repeat these limits.
 */
export const NOTE_MAX = 2000;
export const TASK_TITLE_MAX = 300;

export type Validated<T> = { ok: true; value: T } | { ok: false; message: string };

export function validateNote(input: unknown): Validated<string> {
  if (typeof input !== "string") return { ok: false, message: "A note is required." };
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, message: "A note can't be empty." };
  if (text.length > NOTE_MAX) return { ok: false, message: `A note can be at most ${NOTE_MAX} characters.` };
  return { ok: true, value: text };
}

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export type TaskInput = { title: string; notes: string | null; dueDate: string | null };

export function validateTask(input: { title?: unknown; notes?: unknown; dueDate?: unknown }): Validated<TaskInput> {
  if (typeof input.title !== "string") return { ok: false, message: "A task title is required." };
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false, message: "A task title can't be empty." };
  if (title.length > TASK_TITLE_MAX) return { ok: false, message: `A task title can be at most ${TASK_TITLE_MAX} characters.` };

  let dueDate: string | null = null;
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== "") {
    if (typeof input.dueDate !== "string" || !isRealDate(input.dueDate)) return { ok: false, message: "The due date must be a real date (YYYY-MM-DD)." };
    dueDate = input.dueDate;
  }

  let notes: string | null = null;
  if (typeof input.notes === "string" && input.notes.trim()) {
    notes = input.notes.trim();
    if (notes.length > NOTE_MAX) return { ok: false, message: `Task notes can be at most ${NOTE_MAX} characters.` };
  }
  return { ok: true, value: { title, notes, dueDate } };
}

/** Postgres/PostgREST errors that mean "the tables have not been created yet". */
export function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("does not exist") || message.includes("schema cache");
}
