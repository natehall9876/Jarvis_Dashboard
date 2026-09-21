"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, Mic, RotateCw, Send, Sparkles, Square, Trash2, Volume2, VolumeX, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContextualQuestions, getPageContextLabel } from "@/lib/ai/questions";
import { ProposedActionCard } from "@/components/ai-advisor/proposed-action-card";
import { MarkdownMessage } from "@/components/ai-advisor/markdown-message";
import { useJarvis } from "@/components/jarvis/jarvis-provider";
import type { EntityReference } from "@/lib/ai/tool-types";

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

/**
 * The conversation view. All state lives in the app-wide JarvisProvider, so
 * this renders the same continuing session wherever it is mounted (Command
 * Center, the full advisor page, or the persistent drawer) and survives page
 * navigation. Typed and spoken input take exactly the same path.
 */
export function AskAdvisor({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const jarvis = useJarvis();
  const [question, setQuestion] = useState("");

  const { exchanges, loading, listening, interim, voiceError, voiceSupported, speechOutputSupported, muted, conversationMode } = jarvis;

  function submit(q: string) {
    if (!q.trim() || loading) return;
    setQuestion("");
    void jarvis.submit(q);
  }

  const contextualQuestions = getContextualQuestions(pathname);
  const questionsToShow = compact ? contextualQuestions.slice(0, 4) : contextualQuestions;
  const contextLabel = getPageContextLabel(pathname);
  const first = exchanges[0];

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
        className={`group flex items-center gap-2 rounded-2xl border bg-[var(--color-surface-2)] p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] transition-all duration-300 ${
          loading || listening
            ? "border-[var(--color-accent)] shadow-[0_0_24px_-6px_var(--color-accent-glow)]"
            : "border-[var(--color-border-strong)] focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_20px_-8px_var(--color-accent-glow)]"
        }`}
      >
        <Sparkles className={`ml-2 h-4 w-4 shrink-0 text-[var(--color-accent)] transition-opacity ${loading ? "animate-pulse" : "opacity-60 group-focus-within:opacity-100"}`} />
        <input
          value={listening ? interim : question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={listening ? "Listening..." : "Ask Jarvis, or tap the mic and speak..."}
          aria-label="Ask Jarvis a question"
          disabled={loading || listening}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:opacity-60"
        />
        <Button
          type="button"
          variant={listening ? "danger" : "secondary"}
          aria-label={listening ? "Stop listening" : "Ask Jarvis by voice"}
          disabled={loading}
          onClick={listening ? jarvis.stopListening : jarvis.startListening}
          className="rounded-xl px-2.5"
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button type="submit" disabled={loading || listening || !question.trim()} aria-label="Ask" className="rounded-xl px-2.5 sm:px-3">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Ask</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
        {speechOutputSupported ? (
          <button type="button" onClick={jarvis.toggleMute} className="flex items-center gap-1 hover:text-[var(--color-text-primary)]" aria-pressed={muted}>
            {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            {muted ? "Spoken replies muted" : "Spoken replies on (for voice questions)"}
          </button>
        ) : null}
        {voiceSupported ? (
          <button type="button" onClick={jarvis.toggleConversationMode} className="flex items-center gap-1 hover:text-[var(--color-text-primary)]" aria-pressed={conversationMode}>
            <Mic className="h-3 w-3" />
            Hands-free: {conversationMode ? "on — listens again after each reply" : "off"}
          </button>
        ) : null}
        {exchanges.length > 0 ? (
          <button type="button" onClick={jarvis.clear} className="flex items-center gap-1 hover:text-[var(--color-text-primary)]">
            <Trash2 className="h-3 w-3" />
            Clear conversation
          </button>
        ) : null}
      </div>

      {listening ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          </span>
          Listening — tap the square to stop
        </div>
      ) : null}

      {voiceError ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {voiceError}
        </p>
      ) : null}

      {loading && first?.status === "streaming" && !first?.answer ? (
        <div className="flex items-center gap-2 text-xs text-[var(--color-accent)]">
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)] [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-accent)]" />
          </span>
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

      {exchanges.length > 0 ? (
        <div className="space-y-3">
          {exchanges.map((exchange) => (
            <div key={exchange.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-sm">
              <p className="flex items-center gap-1.5 border-b border-[var(--color-border)]/60 bg-[var(--color-surface-1)]/40 px-3 py-2 text-sm font-medium text-[var(--color-text-primary)]">
                {exchange.viaVoice ? <Mic className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" aria-label="Spoken" /> : null}
                {exchange.question}
              </p>
              <div className="p-3">
                {exchange.status !== "error" ? (
                  <>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
                        <Sparkles className={`h-3 w-3 text-[var(--color-accent)] ${exchange.status === "streaming" ? "animate-pulse" : ""}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <MarkdownMessage text={exchange.answer ?? ""} />
                        {exchange.status === "streaming" && exchange.answer ? (
                          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[var(--color-accent)] align-middle" />
                        ) : null}
                      </div>
                    </div>
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
                        onExecutingChange={jarvis.setActionExecuting}
                        onSettled={jarvis.noteActionSettled}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="flex items-start gap-1.5 text-sm text-[var(--color-warning)]">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {exchange.error}
                    </p>
                    <Button type="button" variant="secondary" onClick={() => jarvis.retry(exchange.id)} disabled={loading}>
                      <RotateCw className="h-3.5 w-3.5" />
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
