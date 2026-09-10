"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Send, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContextualQuestions, getPageContextLabel } from "@/lib/ai/questions";
import { ProposedActionCard } from "@/components/ai-advisor/proposed-action-card";
import type { EntityReference } from "@/lib/ai/tool-types";
import type { ProposedAction } from "@/lib/ai/action-types";

type Exchange = {
  /** Stable identity for React's list key — exchanges are prepended (newest first), so an array index would silently shift onto a different exchange every time a new one arrives, carrying over that DOM node's local state (e.g. a ProposedActionCard's confirm/cancel status) onto unrelated content. */
  id: string;
  question: string;
  answer: string | null;
  error: string | null;
  references: EntityReference[];
  toolsUsed: string[];
  proposedAction: ProposedAction | null;
};

const ENTITY_PATHS: Record<EntityReference["type"], string> = {
  client: "/clients",
  property: "/properties",
  job: "/jobs",
  invoice: "/invoices",
  quote: "/quotes",
  employee: "/employees",
  equipment: "/equipment",
  route: "/routes",
};

/** "get_overdue_invoices" -> "overdue invoices" — a short human phrase for the "Jarvis checked" trail. */
function humanizeToolName(name: string): string {
  return name.replace(/^get_/, "").replace(/_/g, " ");
}

export function AskAdvisor({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);

  // Deliberately takes plain text and doesn't care where it came from — a
  // typed question, a suggested-question chip, or (later) a speech-to-text
  // transcript all call this the same way, into the same conversation and
  // the same /api/ai-advisor endpoint. Voice input should plug in here
  // rather than growing a separate intelligence path.
  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setQuestion("");

    // Chronological order for the model, and only successful turns — a
    // failed exchange has no real answer to replay as conversation context.
    const conversationHistory = history
      .filter((h) => h.answer !== null)
      .slice(0, 6)
      .reverse()
      .map((h) => ({ question: h.question, answer: h.answer as string }));

    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, path: pathname, history: conversationHistory }),
      });
      const json = (await res.json()) as {
        answer?: string;
        error?: string;
        references?: EntityReference[];
        toolsUsed?: string[];
        proposedAction?: ProposedAction | null;
      };
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          question: trimmed,
          answer: json.answer ?? null,
          error: res.ok ? null : json.error ?? "Something went wrong.",
          references: json.references ?? [],
          toolsUsed: json.toolsUsed ?? [],
          proposedAction: json.proposedAction ?? null,
        },
        ...prev,
      ]);
    } catch {
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          question: trimmed,
          answer: null,
          error: "Couldn't reach the advisor. Check your connection and try again.",
          references: [],
          toolsUsed: [],
          proposedAction: null,
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  }

  const contextualQuestions = getContextualQuestions(pathname);
  const questionsToShow = compact ? contextualQuestions.slice(0, 4) : contextualQuestions;
  const contextLabel = getPageContextLabel(pathname);

  return (
    <div className="flex flex-col gap-4">
      {contextLabel ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
          <Sparkles className="h-3 w-3" />
          Grounded in {contextLabel}
        </div>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Jarvis about today's business..."
          aria-label="Ask Jarvis a question"
          disabled={loading}
          className="flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </Button>
      </form>

      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" />
          Jarvis is checking the numbers...
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {questionsToShow.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => submit(q)}
            disabled={loading}
            className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {history.length > 0 ? (
        <div className="space-y-3">
          {history.map((exchange) => (
            <div key={exchange.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{exchange.question}</p>
              {exchange.answer ? (
                <>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">{exchange.answer}</p>
                  {exchange.references.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {exchange.references.map((ref) => (
                        <Link
                          key={`${ref.type}:${ref.id}`}
                          href={`${ENTITY_PATHS[ref.type]}/${ref.id}`}
                          className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-2 py-0.5 text-xs text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                        >
                          {ref.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {exchange.toolsUsed.length > 0 ? (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                      <Wrench className="h-3 w-3 shrink-0" />
                      Checked: {Array.from(new Set(exchange.toolsUsed.map(humanizeToolName))).join(", ")}
                    </p>
                  ) : null}
                  {exchange.proposedAction ? (
                    <ProposedActionCard
                      key={exchange.proposedAction.id}
                      action={exchange.proposedAction}
                      onSettled={(outcome) => {
                        // A confirmed write can change exactly the record the
                        // current page is showing (e.g. this job's own
                        // date/status/crew) — refresh the server-rendered
                        // data so it's not left displaying the pre-change
                        // state until the owner manually reloads. A cancel
                        // touched nothing, so there's nothing to refresh.
                        if (outcome === "confirmed") router.refresh();
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--color-warning)]">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {exchange.error}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
