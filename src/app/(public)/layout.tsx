import Link from "next/link";
import type { ReactNode } from "react";

const navLink = "inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
          <Link href="/about" className="text-xl font-semibold tracking-tight">Jarvis<span className="text-[var(--color-accent)]">.</span><span className="mt-1 block text-xs font-normal text-[var(--color-text-muted)]">WeedEater Lawn Care</span></Link>
          <nav aria-label="Public information" className="flex flex-wrap gap-1">
            <Link href="/about" className={navLink}>About</Link>
            <Link href="/privacy" className={navLink}>Privacy</Link>
            <Link href="/terms" className={navLink}>Terms</Link>
            <Link href="/login" className={navLink}>Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-20">
        {children}
      </main>
      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-4 px-5 py-7 text-sm text-[var(--color-text-muted)] sm:px-8">
          <p>Jarvis · WeedEater Lawn Care</p>
          <a href="mailto:natehall9876@gmail.com" className="break-all text-[var(--color-accent)] underline underline-offset-4">natehall9876@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}
