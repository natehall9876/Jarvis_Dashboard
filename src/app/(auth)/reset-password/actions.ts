"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!password || password.length < 8) {
    redirect(`/reset-password?error=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  if (password !== confirmPassword) {
    redirect(`/reset-password?error=${encodeURIComponent("Passwords don't match.")}`);
  }

  const supabase = await createSupabaseServerClient();

  // Requires the session a valid recovery link's /auth/confirm redirect
  // already established — there is no separate "current password" check
  // here because the recovery token itself was the proof of identity.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Your password reset link has expired. Request a new one from the login page.")}`);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/?passwordUpdated=1");
}
