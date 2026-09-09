"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { AskAdvisor } from "@/components/ai-advisor/ask-advisor";

/**
 * A persistent Jarvis entry point available on every dashboard page — not
 * just the dedicated /ai-advisor page. Closes automatically on navigation
 * so it never lingers open over a different record than the one you asked
 * about.
 */
export function JarvisDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);

  // Close on navigation without an effect (React's recommended pattern for
  // adjusting state in response to a prop/derived value changing).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  if (pathname === "/ai-advisor") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Jarvis"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-[#062012] shadow-[0_4px_20px_-4px_var(--color-accent-glow),0_2px_8px_rgba(0,0,0,0.4)] transition-transform hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[1px] animate-fade-in">
          <div className="flex h-full w-full max-w-md flex-col border-l border-[var(--color-border-strong)] bg-[var(--color-surface-1)] shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--color-violet)]" />
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Ask Jarvis</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <AskAdvisor />
            </div>
          </div>
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
