"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Home } from "lucide-react";
import { canGoBackInJarvis, navigationFallback, trackNavigationHistory } from "@/lib/jarvis/navigation-history";

const EVENT = "jarvis-navigation-change";
const notify = () => window.dispatchEvent(new Event(EVENT));
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("popstate", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("popstate", callback); };
}
const snapshot = () => canGoBackInJarvis(window.history.state, new URL(window.location.href));
const serverSnapshot = () => false;

/** Root-layout placement keeps a reachable exit on every page, including errors. */
export function NavigationControls() {
  const router = useRouter();
  const pathname = usePathname();
  const canGoBack = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => trackNavigationHistory(window.history, () => new URL(window.location.href), notify), []);
  function back() {
    if (canGoBackInJarvis(window.history.state, new URL(window.location.href))) router.back();
    else router.replace(navigationFallback(pathname));
  }
  const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
  return (
    <nav aria-label="Page navigation" className="sticky top-0 z-40 flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/95 px-4 backdrop-blur-md lg:pl-[calc(15rem+2rem)]" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(56px + env(safe-area-inset-top))" }}>
      <button type="button" onClick={back} disabled={!canGoBack && pathname === "/"} aria-label="Go back" className={action + " disabled:cursor-default disabled:opacity-40"}><ArrowLeft className="h-5 w-5" aria-hidden="true" />Back</button>
      <Link href="/" aria-label="Go to Jarvis home" className={action}><Home className="h-4 w-4" aria-hidden="true" />Home</Link>
    </nav>
  );
}
