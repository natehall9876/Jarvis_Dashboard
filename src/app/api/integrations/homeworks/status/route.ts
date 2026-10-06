import { requireIntegrationOwner } from "@/lib/integrations/owner-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
export const dynamic = "force-dynamic";
export async function GET() {
  const owner = await requireIntegrationOwner();
  if (!owner.ok) return Response.json({ error: "Owner sign-in required" }, { status: 401 });
  const db = await createSupabaseServerClient() as unknown as SupabaseClient;
  const [run, changed, states] = await Promise.all([
    db.from("homeworks_sync_runs").select("id,started_at,completed_at,status,records,error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("homeworks_records").select("changed_at").order("changed_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("homeworks_sync_state").select("stream,last_success_at,last_error,failure_count"),
  ]);
  if (run.error || changed.error || states.error) return Response.json({ error: "Sync status unavailable" }, { status: 503 });
  return Response.json({ run: run.data, revision: [changed.data?.changed_at, run.data?.id, run.data?.status].filter(Boolean).join(":") || null, streams: states.data }, { headers: { "cache-control": "no-store" } });
}
