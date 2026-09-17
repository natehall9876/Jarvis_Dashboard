import { LayoutDashboard, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updatePassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
        </div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Set a new password</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">You&apos;re verified — choose a new password for your Jarvis account.</p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6">
        <form action={updatePassword} className="space-y-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-critical)]/30 bg-[var(--color-critical-soft)] px-3 py-2 text-sm text-[var(--color-critical)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirm_password" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Confirm new password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="Re-enter the same password"
            />
          </div>

          <Button type="submit" className="w-full justify-center">
            Set new password
          </Button>
        </form>
      </div>
    </div>
  );
}
