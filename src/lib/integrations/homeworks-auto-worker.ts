import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getHomeworksSyncAccessToken } from "./homeworks-connection";
import { processStream, type Cursor, type Row } from "./homeworks-auto-core";
import { HOMEWORKS_STREAMS } from "./homeworks-auto-streams";

type State = { stream: string; cursor: Cursor | null; last_success_at: string | null; last_full_at: string | null; failure_count: number };
export async function runAutomaticHomeworksSync() {
  const db = createSupabaseAdminClient() as unknown as SupabaseClient;
  const runId = randomUUID();
  const start = Date.now();
  const lease = await db.rpc("homeworks_claim_lease", { p_name: "sync", p_owner: runId, p_seconds: 280 });
  if (lease.error) throw new Error("Homeworks sync lease unavailable");
  if (lease.data !== true) return { status: "busy", runId, records: 0 };
  let records = 0;
  let activeStream: string | null = null;
  try {
    const begun = await db.from("homeworks_sync_runs").insert({ id: runId });
    if (begun.error) throw new Error("Cannot record the Homeworks sync run");
    // An expired lease left by a terminated server is visible as interrupted.
    await db.from("homeworks_sync_runs").update({ status: "interrupted", error: "Worker stopped before completion; saved pages will resume", completed_at: new Date().toISOString() }).eq("status", "running").lt("started_at", new Date(start - 300_000).toISOString());
    const token = await getHomeworksSyncAccessToken();
    if (!token.ok) throw new Error(token.message);
    const states = await db.from("homeworks_sync_state").select("*");
    if (states.error) throw new Error("Cannot read Homeworks checkpoints");
    const byKey = new Map<string, State>((states.data ?? []).map((s: State) => [s.stream, s]));
    let yielded = false;
    for (const stream of HOMEWORKS_STREAMS) {
      if (Date.now() - start >= 200_000) { yielded = true; break; }
      activeStream = stream.key;
      const state = byKey.get(stream.key);
      const full = !stream.incremental || !state?.last_full_at || Date.now() - Date.parse(state.last_full_at) >= 86_400_000;
      const cursor: Cursor = state?.cursor ?? { after: 0, since: full || !state?.last_success_at ? null : new Date(Date.parse(state.last_success_at) - 300_000).toISOString(), startedAt: new Date().toISOString(), full };
      const apply = async (rows: Row[], after: number, complete = false) => {
        const result = await db.rpc("homeworks_apply_page", {
          p_owner: runId, p_stream: stream.key, p_entity: stream.entity,
          p_rows: rows.map(row => ({ ...row, __deleted: stream.where.isDeleted === true })),
          p_cursor: { ...cursor, after }, p_complete: complete,
        });
        if (result.error) throw new Error(`Homeworks ${stream.key}: ${result.error.message}`);
        records += Number(result.data ?? 0);
        cursor.after = after;
      };
      const complete = await processStream({ stream, cursor, token: token.accessToken,
        apply, complete: () => apply([], cursor.after, true), shouldContinue: () => Date.now() - start < 200_000,
      });
      if (!complete) { yielded = true; break; }
    }
    const status = yielded ? "continuing" : "success";
    const result = await db.from("homeworks_sync_runs").update({ status, records, completed_at: new Date().toISOString() }).eq("id", runId);
    if (result.error) throw new Error("Could not record Homeworks sync completion");
    console.info("[homeworks-auto]", JSON.stringify({ runId, status, records }));
    return { status, runId, records };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Homeworks sync failed";
    console.error("[homeworks-auto]", JSON.stringify({ runId, stream: activeStream, error: message }));
    await db.from("homeworks_sync_runs").update({ status: "failed", records, completed_at: new Date().toISOString(), error: message }).eq("id", runId);
    if (activeStream) {
      const current = await db.from("homeworks_sync_state").select("failure_count").eq("stream", activeStream).maybeSingle();
      const errorState = { last_error: message, failure_count: (current.data?.failure_count ?? 0) + 1, updated_at: new Date().toISOString() };
      if (current.data) await db.from("homeworks_sync_state").update(errorState).eq("stream",activeStream);
      else await db.from("homeworks_sync_state").insert({ stream: activeStream, ...errorState });
    }
    return { status: "failed", runId, records, error: message };
  } finally {
    await db.rpc("homeworks_release_lease", { p_name: "sync", p_owner: runId });
  }
}
