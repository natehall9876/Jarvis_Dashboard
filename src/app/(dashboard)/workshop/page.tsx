import { getProperties } from "@/lib/data/properties";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Workshop } from "@/components/workshop/workshop";
export const dynamic = "force-dynamic";
export default async function WorkshopPage() {
  const db = await createSupabaseServerClient();
  const [{ data: { user } }, properties] = await Promise.all([db.auth.getUser(), getProperties()]);
  return <Workshop owner={user?.id ?? null} properties={properties.data ?? []} dataError={properties.error} />;
}
