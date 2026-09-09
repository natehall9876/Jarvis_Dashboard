import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where Supabase's confirmation/magic-link/password-reset emails land.
 * Uses `token_hash` + `verifyOtp` (Supabase's current recommended pattern)
 * rather than relying on the default hosted verify endpoint's redirect —
 * that path depends on which auth flow (implicit vs PKCE) the project is
 * on and needs its own client-side fragment/code handling either way.
 * `verifyOtp` sidesteps that ambiguity entirely and establishes the
 * session cookie directly, server-side.
 *
 * Requires the "Confirm signup" (and any other relevant) email template in
 * Supabase to link here — see supabase/rls-policies.sql's neighboring
 * setup notes / the project README for the exact template line.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next.startsWith("/") ? next : "/");
    }
  }

  redirect(`/login?error=${encodeURIComponent("That confirmation link is invalid or has expired.")}`);
}
