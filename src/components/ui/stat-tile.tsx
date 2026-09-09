import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  sublabel,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "critical";
  className?: string;
}) {
  const valueColor = {
    neutral: "text-[var(--color-text-primary)]",
    accent: "text-[var(--color-accent)]",
    warning: "text-[var(--color-warning)]",
    critical: "text-[var(--color-critical)]",
  }[tone];

  const accentBar = {
    neutral: "bg-[var(--color-border-strong)]",
    accent: "bg-[var(--color-accent)]",
    warning: "bg-[var(--color-warning)]",
    critical: "bg-[var(--color-critical)]",
  }[tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 transition-colors hover:border-[var(--color-border-strong)]",
        className,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", accentBar)} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
        {icon ? <span className="text-[var(--color-text-muted)]">{icon}</span> : null}
      </div>
      <div className={cn("mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums", valueColor)}>
        {value}
      </div>
      {sublabel ? <div className="mt-1.5 text-xs text-[var(--color-text-secondary)]">{sublabel}</div> : null}
    </div>
  );
}
