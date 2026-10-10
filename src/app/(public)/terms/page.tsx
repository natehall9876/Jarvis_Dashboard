import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Use | Jarvis", description: "Access and use of the private WeedEater Lawn Care Jarvis workspace." };
const heading = "text-xl font-semibold text-[var(--color-text-primary)]";

export default function TermsPage() {
  return (
    <article className="max-w-3xl space-y-8 text-base leading-7 text-[var(--color-text-secondary)]">
      <header className="space-y-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">Jarvis / Workspace access</p><h1 className="text-4xl font-semibold tracking-tight text-[var(--color-text-primary)]">Terms of Use</h1><p className="text-sm">Effective October 10, 2026</p></header>
      <section className="space-y-3"><h2 className={heading}>Purpose and access</h2><p>Jarvis is operated by Nate Hall for WeedEater Lawn Care&apos;s internal operations. Workspace access is limited to authorized users. These terms describe permitted use of that workspace; this site does not offer public account registration or a paid software subscription.</p></section>
      <section className="space-y-3"><h2 className={heading}>Responsible use</h2><p>Use only accounts and records you are authorized to access. Protect your sign-in credentials, do not share access with unauthorized people, and do not attempt to bypass permissions or disrupt the application.</p></section>
      <section className="space-y-3"><h2 className={heading}>Connected services</h2><p>Connecting a third-party service requires the appropriate account owner&apos;s authorization and is subject to that provider&apos;s terms. Google Calendar access in Jarvis is read-only. The owner may disconnect the integration in Settings or revoke access with Google. The <Link href="/privacy" className="text-[var(--color-accent)] underline underline-offset-4">Privacy Policy</Link> explains how information is handled.</p></section>
      <section className="space-y-3"><h2 className={heading}>Operational decisions</h2><p>Connected data may be delayed, incomplete, or temporarily unavailable, and AI answers can be incorrect. Review source records and relevant confirmations before relying on information for scheduling, invoicing, payments, or other consequential business decisions. Jarvis&apos;s calendar preview does not replace the operational job schedule.</p></section>
      <section className="space-y-3"><h2 className={heading}>Availability and changes</h2><p>Features and availability may change as the workspace is maintained. The operator may update these terms and restrict workspace access when necessary to manage the business or protect its information.</p></section>
      <section className="space-y-3"><h2 className={heading}>Contact</h2><p>Questions about access or these terms can be sent to <a className="break-all text-[var(--color-accent)] underline underline-offset-4" href="mailto:natehall9876@gmail.com">natehall9876@gmail.com</a>.</p></section>
    </article>
  );
}
