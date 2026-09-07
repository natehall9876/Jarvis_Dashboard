import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "info" | "warning" | "critical" | "violet";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border-[var(--color-border-strong)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-transparent",
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)] border-transparent",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-transparent",
  critical: "bg-[var(--color-critical-soft)] text-[var(--color-critical)] border-transparent",
  violet: "bg-[var(--color-violet-soft)] text-[var(--color-violet)] border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const statusToneMap: Record<string, BadgeTone> = {
  active: "accent",
  operational: "accent",
  completed: "accent",
  paid: "accent",
  accepted: "accent",

  scheduled: "info",
  sent: "info",
  draft: "neutral",
  inactive: "neutral",
  prospect: "violet",

  in_progress: "info",
  partial: "warning",
  needs_maintenance: "warning",

  overdue: "critical",
  out_of_service: "critical",
  cancelled: "critical",
  declined: "critical",
  skipped: "warning",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = statusToneMap[status] ?? "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ")}</Badge>;
}
