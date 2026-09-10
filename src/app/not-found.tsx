import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Jarvis</h1>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-8">
          <p className="text-3xl font-semibold text-[var(--color-text-primary)]">404</p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            That page doesn&apos;t exist — the record may have been deleted, or the link may be out of date.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#062012] transition-opacity hover:opacity-90"
          >
            Back to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
