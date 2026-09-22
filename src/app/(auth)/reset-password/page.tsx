"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-fields";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Fully client-driven, because Supabase's default recovery email (no
 * custom SMTP on this project, so its template can't be edited) never
 * routes through any server-side route of ours — it redirects the browser
 * straight to the Site URL with the new session encoded as either a `#`
 * hash fragment (implicit flow) or a `?code=` param (PKCE flow), and only
 * client-side JS can read a hash fragment at all. This page resolves
 * whichever shape shows up — hash tokens, a code param (forwarded here by
 * proxy.ts), or an already-valid session (the original /auth/confirm path,
 * kept working in case the email template is ever fixed later) — into a
 * real session, then lets the owner set a new password against it
 * directly through the browser Supabase client, so there's no separate
 * server round-trip that could race the just-established session cookie.
 */
type Status = "resolving" | "ready" | "invalid" | "submitting" | "done" | "error";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("resolving");
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function resolveSession() {
      const supabase = createSupabaseBrowserClient();

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = searchParams.get("code");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (cancelled) return;
        window.history.replaceState(null, "", window.location.pathname);
        if (error) {
          setStatus("invalid");
          return;
        }
        setStatus("ready");
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStatus("invalid");
          return;
        }
        setStatus("ready");
        return;
      }

      // No token in the URL — either arrived via /auth/confirm (which
      // already established a session server-side before redirecting
      // here) or this is a stale/direct visit with nothing to recover.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setStatus(user ? "ready" : "invalid");
    }
    resolveSession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords don't match.");
      return;
    }
    setStatus("submitting");
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setStatus("ready");
      return;
    }
    setStatus("done");
    setTimeout(() => router.replace("/?passwordUpdated=1"), 1200);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
        </div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Set a new password</h1>
        {status === "ready" || status === "submitting" ? (
          <p className="text-sm text-[var(--color-text-secondary)]">You&apos;re verified — choose a new password for your Jarvis account.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6">
        {status === "resolving" ? (
          <div className="flex flex-col items-center gap-2 py-4 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" />
            Verifying your reset link...
          </div>
        ) : status === "invalid" ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-[var(--color-critical)]/30 bg-[var(--color-critical-soft)] px-3 py-2 text-sm text-[var(--color-critical)]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This reset link is invalid or has expired. Request a new one from the login page.</span>
            </div>
            <Button variant="secondary" className="w-full justify-center" onClick={() => router.replace("/login")}>
              Back to login
            </Button>
          </div>
        ) : status === "done" ? (
          <p className="text-sm text-[var(--color-text-secondary)]">Password updated — taking you to the dashboard...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {message ? (
              <div className="flex items-start gap-2 rounded-md border border-[var(--color-critical)]/30 bg-[var(--color-critical-soft)] px-3 py-2 text-sm text-[var(--color-critical)]">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={status === "submitting"}
                className={cn(inputClass, "disabled:opacity-60")}
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirm_password" className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                Confirm new password
              </label>
              <input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={status === "submitting"}
                className={cn(inputClass, "disabled:opacity-60")}
                placeholder="Re-enter the same password"
              />
            </div>

            <Button type="submit" disabled={status === "submitting"} className="w-full justify-center">
              {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Set new password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
