"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUGGESTED_QUESTIONS } from "@/lib/ai/questions";

type Exchange = { question: string; answer: string | null; error: string | null };

export function AskAdvisor({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Exchange[]>([]);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setQuestion("");

    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, path: pathname }),
      });
      const json = (await res.json()) as { answer?: string; error?: string };
      setHistory((prev) => [
        { question: trimmed, answer: json.answer ?? null, error: res.ok ? null : json.error ?? "Something went wrong." },
        ...prev,
      ]);
    } catch {
      setHistory((prev) => [
        { question: trimmed, answer: null, error: "Couldn't reach the advisor. Check your connection and try again." },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  }

  const questionsToShow = compact ? SUGGESTED_QUESTIONS.slice(0, 4) : SUGGESTED_QUESTIONS;

  return (
    <div className="flex flex-col gap-4">
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
          className="flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask
        </Button>
      </form>

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
          {history.map((exchange, i) => (
            <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{exchange.question}</p>
              {exchange.answer ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--color-text-secondary)]">
                  {exchange.answer}
                </p>
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
