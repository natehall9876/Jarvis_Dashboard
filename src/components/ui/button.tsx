import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[#062012] shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_4px_14px_-4px_var(--color-accent-glow)] hover:bg-[var(--color-accent-strong)] active:brightness-95",
  secondary:
    "bg-[var(--color-surface-3)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)] hover:border-[var(--color-border-strong)] active:brightness-95",
  ghost:
    "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]",
  danger:
    "bg-[var(--color-critical-soft)] text-[var(--color-critical)] border border-[var(--color-critical)]/25 hover:bg-[var(--color-critical)] hover:text-white",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
