import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobPhoto } from "@/types/domain";

/** Photos tied directly to a customer (including ones uploaded from their property pages). */
export async function getClientPhotos(clientId: string): Promise<{ data: JobPhoto[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("job_photos").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as JobPhoto[], error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : "Couldn't load photos." };
  }
}
