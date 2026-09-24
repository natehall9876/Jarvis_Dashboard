"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginErrorUrl, safeLoginDestination } from "@/lib/auth/redirect";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeLoginDestination(String(formData.get("redirectTo") ?? "/"));

  if (!email || !password) {
    redirect(loginErrorUrl("Email and password are required.", redirectTo));
  }

  let message: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    message = error?.message ?? null;
  } catch {
    message = "Sign-in is temporarily unavailable. Please try again.";
  }
  // redirect throws; keep it outside the request error handler.
  if (message) redirect(loginErrorUrl(message, redirectTo));

  redirect(redirectTo);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient({ allowSessionClear: true });
  await supabase.auth.signOut();
  redirect("/login");
}
