import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * URL-driven modal: visibility is controlled by the parent Server Component
 * checking a searchParam (e.g. `?new=1`), not client state. The close
 * button just navigates back to `closeHref` — no client JS needed to open,
 * close, or preserve state across a mutation's redirect.
 */
export function Modal({
  title,
  description,
  closeHref,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  closeHref: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-[2px] animate-fade-in">
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-[var(--shadow-raised)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{description}</p> : null}
          </div>
          <Link
            href={closeHref}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
            aria-label="Close"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />Back
          </Link>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
