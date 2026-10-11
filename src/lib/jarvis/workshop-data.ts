"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { WorkshopDetail } from "./workshop-model";

/** All reads use the signed-in cookie client and existing row-level ownership. */
export async function loadWorkshopProperty(id: string) {
  return withDataResult<WorkshopDetail>(async () => {
    if (!/^[a-f\d-]{36}$/i.test(id)) throw new Error("Choose a valid property.");
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error("Sign in to open this property.");
    const result = await db.from("properties").select("*, client:clients(id, first_name, last_name, company_name, data_source, homeworks_id, homeworks_status, homeworks_deleted)").eq("id", id).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("This property is unavailable to your account.");
    const [quotes, jobs] = await Promise.all([
      db.from("quotes").select("*, items:quote_items(*)").eq("property_id", id).order("created_at", { ascending: false }),
      db.from("jobs").select("*, service:services(name)").eq("property_id", id).order("scheduled_date", { ascending: false }).limit(50),
    ]);
    if (quotes.error) throw quotes.error;
    if (jobs.error) throw jobs.error;
    return { property: result.data, quotes: quotes.data ?? [], jobs: jobs.data ?? [], checkedAt: new Date().toISOString() } as unknown as WorkshopDetail;
  });
}
