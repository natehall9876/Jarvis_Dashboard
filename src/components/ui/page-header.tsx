import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
