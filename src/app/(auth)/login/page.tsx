import { LayoutDashboard, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}) {
  const { error, redirectTo } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
        </div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Jarvis</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">WeedEater Lawn Care operations dashboard</p>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6">
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="redirectTo" value={redirectTo ?? "/"} />

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-critical)]/30 bg-[var(--color-critical-soft)] px-3 py-2 text-sm text-[var(--color-critical)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="you@weedeater.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" className="w-full justify-center">
            Sign in
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
        Access is by invitation only. Contact the account owner if you need a login.
      </p>
    </div>
  );
}
