import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceReadiness } from "@/lib/data/integrations";
import { sourceHealth } from "@/lib/data/operations-model";
import { HOMEWORKS_STREAMS } from "@/lib/integrations/homeworks-auto-streams";
import type { ToolSpec } from "@/lib/ai/tool-types";

export const connectionTools: ToolSpec[] = [{
  name: "get_connection_health",
  description: "Check live QuickBooks company access, the selected Google Calendar, AI configuration, and every Homeworks sync checkpoint. Use for connection and data-freshness questions. A fresh checkpoint does not prove the owner entered all work at the source, and AI configuration alone is not proof of a successful AI request.",
  input_schema: { type: "object", properties: {} },
  execute: async () => {
    const readiness = getWorkspaceReadiness();
    let homeworks: Record<string, unknown> = { current: false, error: "Homeworks checkpoints could not be verified." };
    try {
      const db = await createSupabaseServerClient() as unknown as SupabaseClient;
      const [states, run] = await Promise.all([
        db.from("homeworks_sync_state").select("stream,last_success_at,last_error"),
        db.from("homeworks_sync_runs").select("status,error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!states.error && !run.error) {
        const health = sourceHealth(states.data ?? [], HOMEWORKS_STREAMS.map(s => s.key));
        homeworks = { ...health, current: health.current && !run.data?.error, latest_run_status: run.data?.status ?? "unknown", latest_run_error: run.data?.error ?? null, expected_stream_count: HOMEWORKS_STREAMS.length };
      }
    } catch { /* Keep the explicit unavailable result; never infer green from a query failure. */ }
    return { data: { ...await readiness, homeworks } };
  },
}];
