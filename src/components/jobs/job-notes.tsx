"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addJobNote } from "@/lib/actions/notes-tasks";
import type { JobNote } from "@/lib/data/notes-tasks";

/** Dated, attributed notes on one job. Typed notes and notes Jarvis added by voice appear in the same list. */
export function JobNotes({ jobId, notes, needsMigration, error }: { jobId: string; notes: JobNote[]; needsMigration: boolean; error: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setMessage(null);
    start(async () => {
      const res = await addJobNote(jobId, text);
      if (res.ok) {
        setText("");
        router.refresh();
      } else setMessage(res.message);
    });
  }

  if (needsMigration) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Job notes aren&apos;t set up yet. Run <code className="rounded bg-[var(--color-surface-3)] px-1">supabase/job-notes-tasks-migration.sql</code> in the Supabase SQL editor.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Add a note about this job…"
          aria-label="New job note"
          className="min-h-[3rem] flex-1 resize-y rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <Button type="button" onClick={submit} disabled={pending || !text.trim()} className="h-11 sm:h-auto">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save note
        </Button>
      </div>
      {message ? <p className="text-xs text-[var(--color-warning)]">{message}</p> : null}
      {error ? <p className="text-xs text-[var(--color-warning)]">{error}</p> : null}
      {notes.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">No notes yet. You can also say &ldquo;add a note to this job…&rdquo; to Jarvis.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">{n.body}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                {n.source === "voice" ? <Mic className="h-3 w-3" aria-label="Added by voice" /> : null}
                {new Date(n.createdAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
