import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

/** Retired owner import. Only the session check remains; no records are read or written. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to import Homeworks records." }, { status: 401 });
  }
  return NextResponse.json({ error: LEGACY_HOMEWORKS_WRITE_DISABLED }, { status: 410 });
}
