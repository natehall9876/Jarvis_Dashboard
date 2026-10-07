import type { ReactNode } from "react";
import type { HomeworksOwnershipRecord } from "@/lib/homeworks-ownership";

export function HomeworksManagedNotice({ record, children }: {
  record?: HomeworksOwnershipRecord | null;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-text-secondary)]">
      <p className="font-medium text-[var(--color-text-primary)]">Managed in Homeworks</p>
      {record ? <p className="mt-1 break-all text-xs">Homeworks source ID: {record.homeworks_id || "Unavailable"}</p> : null}
      {children ? <p className="mt-1">{children}</p> : null}
    </div>
  );
}
