import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Confirmed-demo client/property ids, for excluding seed/demonstration data
 * from real business totals (Command Center, Business Pulse, AI Advisor).
 * Requires the verified demo-data-classification migration. Read failures
 * propagate so a partial query cannot silently count demo records as real.
 *
 * Deliberately narrow: this only ever excludes rows explicitly marked
 * 'demo'. Anything 'unverified' (the default for most existing records)
 * still counts as real — we don't get to guess a customer is fake just
 * because we don't have provenance for them.
 */
export async function getDemoClientIds(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("clients").select("id").eq("data_source", "demo");
  if (error) throw error;
  return new Set((data ?? []).map((c) => c.id));
}

export async function getDemoPropertyIds(): Promise<Set<string>> {
  const demoClientIds = await getDemoClientIds();
  if (demoClientIds.size === 0) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("properties").select("id, client_id").in("client_id", Array.from(demoClientIds));
  if (error) throw error;
  return new Set((data ?? []).map((p) => p.id));
}
