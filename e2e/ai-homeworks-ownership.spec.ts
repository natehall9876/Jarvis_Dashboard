import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isProposedAction, type ProposedAction } from "../src/lib/ai/action-types";
import { loadServerModule } from "./load-server-module";

const supportedTools = [
  "propose_reschedule_job", "propose_update_job_status", "propose_add_job_note",
  "propose_create_task", "propose_complete_task",
];

function proposal(type: string, payload: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "proposed_action", id: "action-1", type, title: "Owner requested change",
    target: { type: "job", id: "job-1" }, current: null, proposed: payload,
    payload, explanation: "Requested by owner.", warnings: [], requiresConfirmation: true,
    snapshot: { updated_at: "2026-10-07T08:00:00Z" }, createdAt: "2026-10-07T08:00:00Z",
  };
}

function fixture(options: { sourceFailure?: boolean } = {}) {
  type Row = Record<string, unknown>;
  const job = {
    id: "job-1", homeworks_id: "101", updated_at: "2026-10-07T08:00:00Z",
    scheduled_date: "2026-10-07", scheduled_start_time: "09:00", status: "scheduled",
    notes: "Homeworks source notes", service: { name: "Mowing" },
    property: { client: { first_name: "Test", last_name: "Owner" } }, crew: [],
  };
  const rows: Record<string, Row[]> = {
    jobs: [job], job_notes: [], action_requests: [],
    owner_tasks: [{ id: "task-1", title: "Bring the mower", status: "open" }],
  };
  const writes: { table: string; body: Row }[] = [];
  const requests: string[] = [];
  const sourceWrites: { id: string; patch: Row }[] = [];
  const activity: Row[] = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      const method = init?.method ?? "GET";
      requests.push(`${method} ${table}`);
      if (!rows[table]) throw new Error(`Unexpected table: ${table}`);
      const matches = (row: Row) => Array.from(url.searchParams).every(([key, value]) => {
        if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
        if (value.startsWith("neq.")) return String(row[key]) !== value.slice(4);
        return true;
      });
      let selected = rows[table].filter(matches);
      if (method !== "GET") {
        const body = JSON.parse(String(init?.body)) as Row;
        writes.push({ table, body });
        if (table === "jobs" || table === "job_employees") throw new Error("AI must not mutate source rows directly.");
        if (method === "POST") {
          if (table === "action_requests" && rows[table].some(row => row.id === body.id)) {
            return Response.json({ code: "23505", message: "duplicate action" }, { status: 409 });
          }
          const inserted = { id: `${table}-${rows[table].length + 1}`, ...(table === "owner_tasks" ? { status: "open" } : {}), ...body };
          rows[table].push(inserted);
          selected = [inserted];
        } else if (method === "PATCH") {
          selected.forEach(row => Object.assign(row, body));
        } else {
          throw new Error(`Unexpected method: ${method}`);
        }
      }
      const single = new Headers(init?.headers).get("accept")?.includes("application/vnd.pgrst.object+json");
      return Response.json(single ? selected[0] ?? null : selected);
    } },
  });
  const mocks = {
    "next/cache": { revalidatePath: () => {} },
    "@/lib/env": { isSupabaseConfigured: () => true },
    "@/lib/supabase/server": { createSupabaseServerClient: async () => ({
      from: client.from.bind(client), auth: { getUser: async () => ({ data: { user: { id: "owner-1" } }, error: null }) },
    }) },
    "@/lib/data/jobs": { getJobById: async () => ({ data: { ...job }, error: null }) },
    "@/lib/data/notes-tasks": {
      getJobNotes: async () => ({ data: [], error: null }),
      getOpenTasks: async () => ({ data: rows.owner_tasks.filter(row => row.status === "open"), error: null }),
    },
    "@/lib/data/activity-log": { logActivity: async (entry: Row) => { activity.push(entry); } },
    "@/lib/integrations/homeworks-schedule-write": { writeHomeworksSchedule: async (id: string, patch: Row) => {
      sourceWrites.push({ id, patch });
      if (options.sourceFailure) throw new Error("Homeworks rejected the change.");
      Object.assign(job, patch);
    } },
  };
  const executor = loadServerModule<typeof import("../src/lib/ai/actions/execute")>("src/lib/ai/actions/execute.ts", mocks);
  const registry = loadServerModule<typeof import("../src/lib/ai/tools")>("src/lib/ai/tools/index.ts", mocks);
  return { executor, registry, mocks, rows, writes, requests, sourceWrites, activity, job };
}

test("the real tool registry exports only the five supported proposals", () => {
  const f = fixture();
  for (const name of ["propose_create_job", "propose_assign_employee"]) {
    expect(f.registry.findTool(name)).toBeUndefined();
    expect(f.registry.ALL_TOOLS.some(tool => tool.name === name)).toBe(false);
    expect(f.registry.toolDefinitions().some(tool => tool.name === name)).toBe(false);
  }
  expect(f.registry.toolDefinitions().filter(tool => tool.name.startsWith("propose_")).map(tool => tool.name).sort()).toEqual([...supportedTools].sort());
  expect(f.requests).toEqual([]);
});

for (const type of ["create_job", "assign_employee", "delete_everything"]) {
  test(`${type} is rejected at the guard, HTTP endpoint, and executor before any database access`, async () => {
    const f = fixture();
    const action = proposal(type, { property_id: "property-1", employee_ids: ["employee-1"] });
    expect(isProposedAction(action)).toBe(false);
    await expect(f.executor.executeProposedAction(action)).resolves.toMatchObject({ ok: false, reason: "invalid" });
    const endpoint = loadServerModule<typeof import("../src/app/api/ai-advisor/execute-action/route")>("src/app/api/ai-advisor/execute-action/route.ts", f.mocks);
    const response = await endpoint.POST(new Request("http://localhost/api/ai-advisor/execute-action", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }),
    }));
    expect(response.status).toBe(400);
    expect(f.requests).toEqual([]);
    expect(f.sourceWrites).toEqual([]);
  });
}

test("retired confirmation cards have no action button while supported cards still require a tap", () => {
  const { ProposedActionCard } = loadServerModule<typeof import("../src/components/ai-advisor/proposed-action-card")>("src/components/ai-advisor/proposed-action-card.tsx");
  for (const type of ["create_job", "assign_employee"]) {
    const html = renderToStaticMarkup(createElement(ProposedActionCard, { action: proposal(type) as ProposedAction }));
    expect(html).toContain("no longer supported");
    expect(html).not.toContain("<button");
  }
  for (const type of ["reschedule_job", "update_job_status", "add_job_note", "create_task", "complete_task"]) {
    const html = renderToStaticMarkup(createElement(ProposedActionCard, { action: proposal(type) as ProposedAction }));
    expect(html).toContain("Confirm change");
  }
});

for (const [name, input, expected] of [
  ["propose_reschedule_job", { job_id: "job-1", new_date: "2026-10-08", new_time: "10:30" }, { scheduled_date: "2026-10-08", scheduled_start_time: "10:30" }],
  ["propose_update_job_status", { job_id: "job-1", new_status: "completed" }, { status: "completed" }],
] as const) {
  test(`${name} still proposes without writes and confirms through the shared Homeworks boundary`, async () => {
    const f = fixture();
    const { data: action } = await f.registry.findTool(name)!.execute(input);
    expect(isProposedAction(action)).toBe(true);
    expect(f.writes).toEqual([]);
    expect(f.sourceWrites).toEqual([]);
    const result = await f.executor.executeProposedAction(action);
    expect(result).toMatchObject({ ok: true, result: { job_id: "job-1", ...expected } });
    expect(f.sourceWrites).toEqual([{ id: "101", patch: expected }]);
    expect(f.job.notes).toBe("Homeworks source notes");
    expect(f.writes.every(write => write.table === "action_requests")).toBe(true);
    expect(f.activity).toHaveLength(1);
    expect(f.rows.action_requests[0].status).toBe("executed");
    await expect(f.executor.executeProposedAction(action)).resolves.toMatchObject({ ok: false, reason: "already_processed" });
    expect(f.sourceWrites).toHaveLength(1);
  });

  test(`${name} reports Homeworks failure without changing local source fields`, async () => {
    const f = fixture({ sourceFailure: true });
    const { data: action } = await f.registry.findTool(name)!.execute(input);
    expect(await f.executor.executeProposedAction(action)).toMatchObject({ ok: false, message: "Homeworks rejected the change." });
    expect(f.job).toMatchObject({ scheduled_date: "2026-10-07", status: "scheduled", notes: "Homeworks source notes" });
    expect(f.writes.every(write => write.table === "action_requests")).toBe(true);
    expect(f.activity).toEqual([]);
    expect(f.rows.action_requests[0].status).toBe("failed");
  });
}

for (const [name, input, table, expected] of [
  ["propose_add_job_note", { job_id: "job-1", note: "  Bring the mower  " }, "job_notes", { job_id: "job-1", body: "Bring the mower", source: "voice" }],
  ["propose_create_task", { title: "Bring the mower" }, "owner_tasks", { title: "Bring the mower", due_date: null, source: "voice" }],
  ["propose_complete_task", { task_id: "task-1" }, "owner_tasks", { status: "done" }],
] as const) {
  test(`${name} still saves its local addition only after confirmation`, async () => {
    const f = fixture();
    const { data: action } = await f.registry.findTool(name)!.execute(input);
    expect(isProposedAction(action)).toBe(true);
    expect(f.writes).toEqual([]);
    expect(await f.executor.executeProposedAction(action)).toMatchObject({ ok: true });
    expect(f.writes.filter(write => write.table !== "action_requests")).toEqual([{ table, body: expect.objectContaining(expected) }]);
    expect(f.sourceWrites).toEqual([]);
    expect(f.job.notes).toBe("Homeworks source notes");
    expect(f.rows.action_requests[0].status).toBe("executed");
  });
}
