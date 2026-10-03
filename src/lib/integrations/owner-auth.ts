import { createSupabaseServerClient } from "@/lib/supabase/server";

type OwnerAccess = { ok: true; userId: string } | { ok: false; message: string };

/** OAuth stores bypass RLS. Match the live business tables' active-owner guard
 * before using the admin client; a valid Supabase session alone is insufficient. */
export async function requireIntegrationOwner(): Promise<OwnerAccess> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false, message: "Sign in as the Jarvis owner to manage integrations." };
    const { data, error } = await supabase.from("app_members").select("role, active").eq("user_id", user.id).maybeSingle();
    if (error) return { ok: false, message: "Owner access could not be verified. Retry when the database is available." };
    if (!data || data.role !== "owner" || data.active !== true) return { ok: false, message: "An active Jarvis owner account is required to manage integrations." };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, message: "Owner access could not be verified. Check server configuration and retry." };
  }
}
