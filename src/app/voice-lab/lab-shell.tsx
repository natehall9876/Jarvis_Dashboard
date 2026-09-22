"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { JarvisProvider } from "@/components/jarvis/jarvis-provider";
import { VoiceDock } from "@/components/jarvis/voice-dock";

declare global {
  interface Window {
    __labMounts?: number;
  }
}

function MountProbe() {
  useEffect(() => {
    window.__labMounts = (window.__labMounts ?? 0) + 1;
  }, []);
  return null;
}

/** Development-only harness: the real JarvisProvider + VoiceDock over stand-in pages, so voice and navigation persistence can be exercised without a login. */
export function LabShell({ children }: { children: ReactNode }) {
  return (
    <JarvisProvider pathPrefix="/voice-lab">
      <MountProbe />
      <nav className="flex gap-4 border-b border-[var(--color-border)] p-4 text-sm">
        <Link href="/voice-lab">Lab home</Link>
        <Link href="/voice-lab/schedule">Lab schedule</Link>
        <Link href="/voice-lab/jobs/lab-job-1">Lab job</Link>
        <Link href="/voice-lab/jobs/lab-job-error">Lab job (errors)</Link>
      </nav>
      {/* Matches (dashboard)/layout.tsx's real pb-36/lg:pb-24 — without it,
          this lab shell under-reports bottom clearance: the real dashboard
          layout already reserves this space for the fixed Jarvis dock, but
          this separate dev shell didn't, so pages reviewed here would look
          like they had a dock-overlap bug the real app doesn't actually have. */}
      <main className="p-6 pb-36 lg:pb-24" data-testid="lab-main">
        {children}
      </main>
      <VoiceDock />
    </JarvisProvider>
  );
}
