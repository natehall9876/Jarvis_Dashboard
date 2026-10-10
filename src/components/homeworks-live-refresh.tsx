"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
/** Reads sync status only. Synchronization itself runs entirely on the server. */
export function HomeworksLiveRefresh() {
  const router = useRouter();
  const revision = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let inFlight = false;
    async function check() {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/integrations/homeworks/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (!response.ok) return;
        const state = await response.json();
        if (disposed) return;
        const element = document.activeElement;
        if (element instanceof HTMLElement && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))) return;
        if (revision.current !== undefined && revision.current !== state.revision) router.refresh();
        revision.current = state.revision;
      } catch { /* Status endpoint will show a visible error on the source page. */ }
      finally { inFlight = false; }
    }
    void check();
    const timer = setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [router]);
  return null;
}
