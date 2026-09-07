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

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </span>
        {icon ? <span className="text-[var(--color-text-muted)]">{icon}</span> : null}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", valueColor)}>{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-[var(--color-text-secondary)]">{sublabel}</div> : null}
    </div>
  );
}
