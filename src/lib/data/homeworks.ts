import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Capture the request's observation time alongside its read-only data snapshot. */
export async function getHomeworksOperations(entity: string, page: number) {
  const db = await createSupabaseServerClient() as unknown as SupabaseClient;
  const [records, run, states] = await Promise.all([
    db.from("homeworks_records").select("*", { count: "exact" }).eq("entity", entity).order("changed_at", { ascending: false }).order("homeworks_id").range(page * 100, page * 100 + 99),
    db.from("homeworks_sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("homeworks_sync_state").select("stream,last_success_at,last_error"),
  ]);
  return { records, run, states, checkedAt: Date.now() };
}
