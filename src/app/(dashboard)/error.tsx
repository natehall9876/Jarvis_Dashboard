"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-critical)]/40 px-6 py-16 text-center">
      <AlertTriangle className="h-6 w-6 text-[var(--color-critical)]" />
      <p className="text-sm font-medium text-[var(--color-text-primary)]">Something went wrong loading this page.</p>
      <p className="max-w-sm text-xs text-[var(--color-text-secondary)]">{error.message}</p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
