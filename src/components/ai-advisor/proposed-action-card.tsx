"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import type { ProposedAction } from "@/lib/ai/action-types";

const FIELD_LABELS: Record<string, string> = {
  scheduled_date: "Scheduled date",
  scheduled_start_time: "Start time",
  status: "Status",
  crew: "Crew",
  property: "Property",
  price: "Price",
  budgeted_hours: "Budgeted hours",
  crew_size: "Crew size",
};

function label(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "nobody";
  return String(value);
}

type CardState = { kind: "pending" } | { kind: "confirming" } | { kind: "done"; message: string } | { kind: "error"; message: string; retryable: boolean };

export function ProposedActionCard({ action, onSettled }: { action: ProposedAction; onSettled?: (outcome: "confirmed" | "cancelled") => void }) {
  const [state, setState] = useState<CardState>({ kind: "pending" });

  async function confirm() {
    if (state.kind === "confirming" || state.kind === "done") return;
    setState({ kind: "confirming" });
    try {
      const res = await fetch("/api/ai-advisor/execute-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { message?: string; error?: string; reason?: string };
      if (res.ok) {
        setState({ kind: "done", message: json.message ?? "Done." });
        onSettled?.("confirmed");
      } else {
        const retryable = json.reason !== "already_processed" && json.reason !== "stale";
        setState({ kind: "error", message: json.error ?? "Something went wrong.", retryable });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server. Check your connection and try again.", retryable: true });
    }
  }

  function cancel() {
    // No network call — cancelling a proposal must never touch the database.
    setState({ kind: "done", message: "Cancelled — no changes were made." });
    onSettled?.("cancelled");
  }

  const fieldKeys = Array.from(new Set([...(action.current ? Object.keys(action.current) : []), ...Object.keys(action.proposed)]));

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-surface-1)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">Proposed change</p>
      <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{action.title}</p>

      <div className="mt-2 space-y-1.5">
        {fieldKeys.map((key) => (
          <div key={key} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[var(--color-text-muted)]">{label(key)}</span>
            <span className="flex items-center gap-1.5 text-right text-[var(--color-text-primary)]">
              {action.current ? (
                <>
                  <span className="text-[var(--color-text-muted)] line-through">{formatValue(action.current[key])}</span>
                  <span className="text-[var(--color-text-muted)]">→</span>
                </>
              ) : null}
              <span className="font-medium">{formatValue(action.proposed[key])}</span>
            </span>
          </div>
        ))}
      </div>

      {action.explanation ? <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Reason: {action.explanation}</p> : null}

      {action.warnings.length > 0 ? (
        <div className="mt-2 space-y-1">
          {action.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      ) : null}

      {state.kind === "pending" || state.kind === "confirming" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={state.kind === "confirming"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[#062012] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {state.kind === "confirming" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirm change
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={state.kind === "confirming"}
            className="flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      ) : state.kind === "done" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
          <Check className="h-3.5 w-3.5" />
          {state.message}
        </p>
      ) : (
        <div className="mt-3">
          <p className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {state.message}
          </p>
          {state.retryable ? (
            <button
              type="button"
              onClick={confirm}
              className="mt-2 rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
