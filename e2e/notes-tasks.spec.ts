import { test, expect } from "@playwright/test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadServerModule } from "./load-server-module";
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

function taskCardHarness(actions: Record<string, unknown>, tasks: Array<Record<string, unknown>> = []) {
  let cursor = 0;
  let refreshCount = 0;
  const state: unknown[] = [];
  const work: Promise<unknown>[] = [];
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [state[index], (value: unknown) => {
        state[index] = typeof value === "function" ? (value as (prior: unknown) => unknown)(state[index]) : value;
      }];
    },
    useTransition: () => [false, (run: () => Promise<unknown>) => { work.push(run()); }],
    router: { refresh() { refreshCount++; } },
  };
  const { TasksCard } = loadServerModule<{ TasksCard: (input: Record<string, unknown>) => ReactNode }>(
    "src/components/command-center/tasks-card.tsx",
    {
      react: { useState: hooks.useState, useTransition: hooks.useTransition },
      "next/navigation": { useRouter: () => hooks.router },
      "next/link": { default: (props: Record<string, unknown> & { children?: ReactNode }) => createElement("a", props, props.children) },
      "@/components/ui/button": {
        Button: (props: Record<string, unknown> & { children?: ReactNode }) => createElement("button", props, props.children),
      },
      "@/lib/actions/notes-tasks": actions,
    },
  );
  function tree() {
    cursor = 0;
    return TasksCard({ tasks, needsMigration: false, error: null, today: "2026-10-10" });
  }
  function walk(node: ReactNode, predicate: (props: Record<string, unknown>, html: string) => boolean): Record<string, unknown> | undefined {
    if (Array.isArray(node)) return node.map(child => walk(child, predicate)).find(Boolean);
    if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(node)) return;
    const html = renderToStaticMarkup(node);
    if (predicate(node.props, html)) return node.props;
    return walk(node.props.children, predicate);
  }
  async function settle() {
    await Promise.allSettled(work.splice(0));
  }
  return {
    html: () => renderToStaticMarkup(tree()),
    refreshes: () => refreshCount,
    change(label: string, value: string) {
      const props = walk(tree(), candidate => candidate["aria-label"] === label);
      expect(props, "expected input: " + label).toBeTruthy();
      (props!.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    },
    async submit() {
      const props = walk(tree(), candidate => typeof candidate.onSubmit === "function");
      expect(props, "expected task form").toBeTruthy();
      (props!.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
      await settle();
    },
    async click(label: string) {
      const props = walk(tree(), (candidate, html) => typeof candidate.onClick === "function" && html.includes(label));
      expect(props, "expected control: " + label).toBeTruthy();
      (props!.onClick as () => void)();
      await settle();
    },
  };
}

test("uncertain task creation preserves the draft, refreshes truth, and is announced", async () => {
  let fails = true;
  const received: Array<Record<string, unknown>> = [];
  const ui = taskCardHarness({
    createTask: async (input: Record<string, unknown>) => {
      received.push(input);
      if (fails) throw new Error("raw transport secret must not reach the UI");
      return { ok: true };
    },
    setTaskStatus: async () => ({ ok: true }),
  });
  ui.change("New task", "Bring the dethatcher");
  await ui.submit();
  expect(ui.html()).toContain("Task creation could not be confirmed");
  expect(ui.html()).toContain("check whether it was added before trying again");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).toContain('value="Bring the dethatcher"');
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(1);

  fails = false;
  await ui.submit();
  expect(received).toEqual([
    { title: "Bring the dethatcher", dueDate: null },
    { title: "Bring the dethatcher", dueDate: null },
  ]);
  expect(ui.html()).not.toContain("Task creation could not be confirmed");
  expect(ui.html()).not.toContain('value="Bring the dethatcher"');
  expect(ui.refreshes()).toBe(2);
});

test("uncertain task completion refreshes truth without claiming success", async () => {
  const ui = taskCardHarness({
    createTask: async () => ({ ok: true }),
    setTaskStatus: async () => { throw new Error("raw transport secret must not reach the UI"); },
  }, [{
    id: "task-1", title: "Bring the dethatcher", notes: null, dueDate: "2026-10-10",
    status: "open", source: "typed", jobId: null, createdAt: "2026-10-10T08:00:00Z",
    completedAt: null, updatedAt: "2026-10-10T08:00:00Z",
  }]);
  await ui.click("Mark done: Bring the dethatcher");
  expect(ui.html()).toContain("Task completion could not be confirmed");
  expect(ui.html()).toContain("check its current status before trying again");
  expect(ui.html()).toContain('role="alert"');
  expect(ui.html()).not.toContain("raw transport secret");
  expect(ui.refreshes()).toBe(1);
});

test("task failure text is announced and completion targets meet mobile minimums", () => {
  const ui = taskCardHarness({
    createTask: async () => ({ ok: true }),
    setTaskStatus: async () => ({ ok: true }),
  }, [{
    id: "task-1", title: "Bring the dethatcher", notes: null, dueDate: null,
    status: "open", source: "typed", jobId: null, createdAt: "2026-10-10T08:00:00Z",
    completedAt: null, updatedAt: "2026-10-10T08:00:00Z",
  }]);
  const html = ui.html();
  expect(html).toContain("h-11 w-11");
  expect(html).toContain('aria-label="Mark done: Bring the dethatcher"');
});
