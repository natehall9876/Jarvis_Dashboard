import { test, expect } from "@playwright/test";
import { isMissingTableError, NOTE_MAX, TASK_TITLE_MAX, validateNote, validateTask } from "../src/lib/jarvis/notes-tasks-validation";
import { isProposedAction } from "../src/lib/ai/action-types";
import { readFileSync } from "node:fs";

// Pure-logic tests. The database round-trip (persisting across refresh) needs the
// migration applied to a real Supabase project and a signed-in session, and is
// therefore NOT covered here — see the report.

test.describe("note validation (typed form and Jarvis share it)", () => {
  test("trims and collapses whitespace", () => {
    expect(validateNote("  She wants the bushes\n  trimmed next week  ")).toEqual({ ok: true, value: "She wants the bushes trimmed next week" });
  });
  test("rejects empty, blank, non-string and oversize notes", () => {
    expect(validateNote("").ok).toBe(false);
    expect(validateNote("   \n ").ok).toBe(false);
    expect(validateNote(undefined).ok).toBe(false);
    expect(validateNote(42).ok).toBe(false);
    expect(validateNote("x".repeat(NOTE_MAX + 1)).ok).toBe(false);
    expect(validateNote("x".repeat(NOTE_MAX)).ok).toBe(true);
  });
});

test.describe("task validation", () => {
  test("a title alone is valid; nothing is invented for the due date", () => {
    expect(validateTask({ title: "Bring the dethatcher" })).toEqual({ ok: true, value: { title: "Bring the dethatcher", notes: null, dueDate: null } });
  });
  test("a real due date is accepted and normalized notes are kept", () => {
    expect(validateTask({ title: "Order mulch", dueDate: "2026-09-25", notes: " 3 yards " })).toEqual({ ok: true, value: { title: "Order mulch", notes: "3 yards", dueDate: "2026-09-25" } });
  });
  test("impossible or malformed dates are rejected, never coerced", () => {
    expect(validateTask({ title: "x", dueDate: "2026-02-30" }).ok).toBe(false);
    expect(validateTask({ title: "x", dueDate: "9/25/2026" }).ok).toBe(false);
    expect(validateTask({ title: "x", dueDate: 20260925 }).ok).toBe(false);
  });
  test("empty and oversize titles are rejected", () => {
    expect(validateTask({ title: "  " }).ok).toBe(false);
    expect(validateTask({}).ok).toBe(false);
    expect(validateTask({ title: "x".repeat(TASK_TITLE_MAX + 1) }).ok).toBe(false);
  });
});

test.describe("setup detection", () => {
  test("a missing table is recognized so the UI says 'run the migration' instead of failing", () => {
    expect(isMissingTableError({ code: "42P01", message: 'relation "public.owner_tasks" does not exist' })).toBe(true);
    expect(isMissingTableError({ code: "PGRST205", message: "Could not find the table in the schema cache" })).toBe(true);
    expect(isMissingTableError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});

test.describe("voice commands ride the existing confirm-gated action path", () => {
  const base = { kind: "proposed_action", id: "a1", title: "t", proposed: {}, payload: {}, requiresConfirmation: true };
  test("the new action types are accepted by the guard, and unknown ones are not", () => {
    for (const type of ["add_job_note", "create_task", "complete_task"]) expect(isProposedAction({ ...base, type })).toBe(true);
    expect(isProposedAction({ ...base, type: "delete_everything" })).toBe(false);
  });
  test("a proposal that does not require confirmation is rejected", () => {
    expect(isProposedAction({ ...base, type: "create_task", requiresConfirmation: false })).toBe(false);
  });
});

test.describe("migration file is additive", () => {
  const sql = readFileSync("supabase/job-notes-tasks-migration.sql", "utf8").toLowerCase();
  test("creates only new tables and never drops or alters existing data", () => {
    expect(sql).toContain("create table if not exists public.job_notes");
    expect(sql).toContain("create table if not exists public.owner_tasks");
    expect(sql).not.toMatch(/drop table|drop column|truncate|delete from|alter table public\.(jobs|clients|properties)/);
  });
  test("row level security is enabled on both new tables", () => {
    expect(sql).toContain("alter table public.job_notes enable row level security");
    expect(sql).toContain("alter table public.owner_tasks enable row level security");
  });
});
