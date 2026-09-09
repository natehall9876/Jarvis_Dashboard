import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
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
                  "whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.align === undefined || col.align === "left" ? "text-left" : "",
                )}
              >
                {col.header}
              </th>
            ))}
            {onRowHref ? <th className="w-8" aria-hidden /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = onRowHref?.(row);
            return (
              <tr
                key={getRowKey(row)}
                className={cn(
                  "group relative border-b border-[var(--color-border)] transition-colors last:border-0",
                  href && "cursor-pointer hover:bg-[var(--color-surface-2)]",
                )}
              >
                {columns.map((col, i) =>
                  i === 0 && href ? (
                    <td key={col.key} className={cn("relative px-4 py-3", col.className)}>
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-[var(--color-accent)] transition-transform duration-150 group-hover:scale-y-100"
                      />
                      <a href={href} className="relative block">
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
                {href ? (
                  <td className="px-2 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
