import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PGlite } from "@electric-sql/pglite";
import { loadServerModule } from "./load-server-module";

type Row = Record<string, unknown>;
async function fixture(mode: "concurrent" | "changed" | "single") {
  const db = new PGlite();
  await db.exec("create table action_requests (id text primary key, status text not null); insert into action_requests values ('retry-action','failed')");
  let reads = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const tasks: Row[] = [];
  const client = createClient("https://example.supabase.co", "synthetic-key", {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split("/").pop();
      const method = init?.method ?? "GET";
      let rows: Row[] = [];
      if (table === "action_requests") {
        if (method === "POST") {
          const body = JSON.parse(String(init?.body));
          try {
            await db.query("insert into action_requests (id,status) values ($1,$2)", [body.id, body.status]);
          } catch (error) {
            if ((error as { code?: string }).code !== "23505") throw error;
            return Response.json({ code: "23505", message: "duplicate fixture action" }, { status: 409 });
          }
        } else if (method === "GET") {
          rows = (await db.query<Row>("select id,status from action_requests where id=$1", ["retry-action"])).rows;
          reads++;
          if (mode === "concurrent") { if (reads === 2) release(); await barrier; }
        } else if (method === "PATCH") {
          const body = JSON.parse(String(init?.body));
          if (mode === "changed" && body.status === "executing") {
            await db.query("update action_requests set status='executed' where id=$1", ["retry-action"]);
          }
          const params: unknown[] = [body.status, "retry-action"];
          let where = "id=$2";
          const filter = url.searchParams.get("status");
          if (filter?.startsWith("neq.")) { params.push(filter.slice(4)); where += " and status <> $3"; }
          else if (filter?.startsWith("in.(") && filter.endsWith(")")) {
            const statuses = filter.slice(4, -1).split(",");
            const markers = statuses.map(status => { params.push(status); return "$" + params.length; });
            where += " and status in (" + markers.join(",") + ")";
          } else if (filter) throw new Error("Unsupported fixture filter: " + filter);
          rows = (await db.query<Row>("update action_requests set status=$1 where " + where + " returning id,status", params)).rows;
        } else throw new Error("Unexpected action method");
      } else if (table === "owner_tasks") {
        if (method === "POST") {
          const body = JSON.parse(String(init?.body));
          const row = { ...body, id: "task-" + (tasks.length + 1), status: "open" };
          tasks.push(row); rows = [row];
        } else if (method === "GET") {
          rows = tasks.filter(row => "eq." + row.id === url.searchParams.get("id"));
        } else throw new Error("Unexpected task method");
      } else throw new Error("Unexpected external table: " + table);
      const single = new Headers(init?.headers).get("accept")?.includes("application/vnd.pgrst.object+json");
      return Response.json(single ? rows[0] ?? null : rows);
    } },
  });
  const server = { from: client.from.bind(client), auth: { getUser: async () => ({ data: { user: { id: "fixture-owner" } }, error: null }) } };
  const executor = loadServerModule<typeof import("../src/lib/ai/actions/execute")>("src/lib/ai/actions/execute.ts", {
    "@/lib/supabase/server": { createSupabaseServerClient: async () => server },
    "@/lib/data/jobs": { getJobById: async () => { throw new Error("Unexpected job read"); } },
    "@/lib/actions/jobs": { updateJobFields: async () => { throw new Error("Unexpected source write"); }, updateJobStatus: async () => { throw new Error("Unexpected source write"); } },
    "@/lib/data/activity-log": { logActivity: async () => {} },
  });
  return { executor, tasks, db };
}
const action = {
  kind: "proposed_action", id: "retry-action", type: "create_task", title: "Create fixture task",
  target: null, current: null, proposed: { title: "Fixture task" }, payload: { title: "Fixture task" },
  explanation: "Synthetic regression only", warnings: [], requiresConfirmation: true, snapshot: null, createdAt: "2026-10-11T07:00:00Z",
};

test("concurrent failed-action retries permit one mutation using PostgreSQL claim predicates", async () => {
  const f = await fixture("concurrent");
  try {
    const results = await Promise.all([f.executor.executeProposedAction(action), f.executor.executeProposedAction(action)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok && result.reason === "already_processed")).toHaveLength(1);
    expect(f.tasks).toHaveLength(1);
  } finally { await f.db.close(); }
});

test("zero-row reclaim after another attempt finishes never authorizes mutation", async () => {
  const f = await fixture("changed");
  try {
    expect(await f.executor.executeProposedAction(action)).toMatchObject({ ok: false, reason: "already_processed" });
    expect(f.tasks).toHaveLength(0);
  } finally { await f.db.close(); }
});

test("one retry of a failed pre-write action can still finish", async () => {
  const f = await fixture("single");
  try {
    expect(await f.executor.executeProposedAction(action)).toMatchObject({ ok: true });
    expect(f.tasks).toHaveLength(1);
  } finally { await f.db.close(); }
});
