import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogOut, PlugZap } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
export async function Topbar() {
  let userEmail: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }
  return (
    <header className="hidden h-[72px] items-center justify-between border-b border-[var(--color-border)] px-8 lg:flex">
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">{today.format(new Date())}</span>
      <div className="flex items-center gap-5">
        <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"><PlugZap className="h-4 w-4" />Connections</Link>
        {userEmail && <form action={signOut} className="flex items-center gap-3 border-l border-[var(--color-border)] pl-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-3)] text-xs font-semibold uppercase" aria-hidden>{userEmail.slice(0, 1)}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{userEmail}</span>
          <button type="submit" aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"><LogOut className="h-4 w-4" /></button>
        </form>}
      </div>
    </header>
  );
}
