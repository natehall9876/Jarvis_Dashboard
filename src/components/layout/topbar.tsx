import { isSupabaseConfigured } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

const today = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export function Topbar() {
  const configured = isSupabaseConfigured();

  return (
    <header className="hidden items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-1)] px-6 py-3 lg:flex">
      <span className="text-sm text-[var(--color-text-secondary)]">{today.format(new Date())}</span>
      <Badge tone={configured ? "accent" : "warning"}>
        {configured ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {configured ? "Supabase Connected" : "Supabase Not Configured"}
      </Badge>
    </header>
  );
}
