import type { ReactNode } from "react";
import { AlertTriangle, DatabaseZap, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

function StateShell({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
        {icon}
      </div>
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={<Inbox className="h-6 w-6" strokeWidth={1.5} />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

export function ErrorState({
  title = "Couldn't load this data",
  description,
  className,
}: {
  title?: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell
      icon={<AlertTriangle className="h-6 w-6 text-[var(--color-critical)]" strokeWidth={1.5} />}
      title={title}
      description={description}
      className={cn("border-[var(--color-critical)]/30", className)}
    />
  );
}

export function NotConfiguredState({ className }: { className?: string }) {
  return (
    <StateShell
      icon={<DatabaseZap className="h-6 w-6" strokeWidth={1.5} />}
      title="Supabase isn't connected yet"
      description="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server."
      className={className}
    />
  );
}

export function LoadingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-md bg-[var(--color-surface-2)]"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

/** Renders the right state for a DataResult without every page re-deriving this logic. */
export function DataStateGate({
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  error: string | null;
  isEmpty: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  children: ReactNode;
}) {
  if (error) {
    if (error.includes("not configured")) return <NotConfiguredState />;
    return <ErrorState description={error} />;
  }
  if (isEmpty) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <>{children}</>;
}
