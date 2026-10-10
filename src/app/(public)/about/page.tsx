import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Jarvis | WeedEater Lawn Care",
  description: "Jarvis is the private operations workspace for WeedEater Lawn Care, with optional read-only Google Calendar access.",
};

export default function AboutPage() {
  return (
    <div className="space-y-10">
      <div className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">WeedEater Lawn Care / Operations</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Jarvis</h1>
        <p className="text-xl leading-8 text-[var(--color-text-secondary)]">One workspace for the work ahead.</p>
        <p className="max-w-2xl text-base leading-7 text-[var(--color-text-secondary)]">Jarvis helps Nate Hall and authorized WeedEater Lawn Care users review scheduled work, customer records, business tasks, and connected services. Access to the workspace is by invitation.</p>
        <Link href="/login" className="inline-flex min-h-12 items-center rounded-xl bg-[var(--color-accent)] px-5 font-semibold text-[#031018] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">Open your workspace</Link>
      </div>
      <section className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-6 sm:p-8" aria-labelledby="calendar-heading">
        <h2 id="calendar-heading" className="text-2xl font-semibold">Your calendar, with your permission</h2>
        <div className="mt-5 grid gap-7 text-sm leading-6 text-[var(--color-text-secondary)] sm:grid-cols-3">
          <div><h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Connect and choose</h3><p>The account owner can authorize Google Calendar, see the calendars available to that account, and choose a calendar to preview.</p></div>
          <div><h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">Read-only access</h3><p>Jarvis reads events and connection health. It does not create, change, or delete Google Calendar events. Homeworks remains the source for scheduled business jobs.</p></div>
          <div><h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">You stay in control</h3><p>Google authorization is optional. The owner can disconnect it in Jarvis Settings or revoke access from the connected Google account.</p></div>
        </div>
      </section>
      <section className="max-w-3xl space-y-3 text-base leading-7 text-[var(--color-text-secondary)]">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Understand your data</h2>
        <p>Read our <Link className="text-[var(--color-accent)] underline underline-offset-4" href="/privacy">Privacy Policy</Link> for how Jarvis accesses, uses, stores, and shares information, and our <Link className="text-[var(--color-accent)] underline underline-offset-4" href="/terms">Terms of Use</Link> for workspace access and responsibilities.</p>
      </section>
    </div>
  );
}
