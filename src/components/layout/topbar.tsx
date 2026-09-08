import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";

const today = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export async function Topbar() {
  const configured = isSupabaseConfigured();

  let userEmail: string | null = null;
  if (configured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return (
    <header className="hidden items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-6 py-3 lg:flex">
      <span className="text-sm text-[var(--color-text-secondary)]">{today.format(new Date())}</span>
      <div className="flex items-center gap-3">
        <Badge tone={configured ? "accent" : "warning"}>
          {configured ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {configured ? "Supabase Connected" : "Supabase Not Configured"}
        </Badge>
        {userEmail ? (
          <form action={signOut} className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">{userEmail}</span>
            <button
              type="submit"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
