import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowHref,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowHref?: (row: T) => string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.align === undefined || col.align === "left" ? "text-left" : "",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = onRowHref?.(row);
            return (
              <tr
                key={getRowKey(row)}
                className="group border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
              >
                {columns.map((col, i) =>
                  i === 0 && href ? (
                    <td key={col.key} className={cn("px-4 py-3", col.className)}>
                      <a href={href} className="block">
                        {col.render(row)}
                      </a>
                    </td>
                  ) : (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-[var(--color-text-secondary)]",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
