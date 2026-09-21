"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Circle, Loader2, Mic, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTask, setTaskStatus } from "@/lib/actions/notes-tasks";
import type { OwnerTask } from "@/lib/data/notes-tasks";

/** Open owner tasks. Tasks can be added here by typing, or by telling Jarvis ("remind me to bring the dethatcher"). */
export function TasksCard({ tasks, needsMigration, error, today }: { tasks: OwnerTask[]; needsMigration: boolean; error: string | null; today: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setMessage(null);
    start(async () => {
      const res = await createTask({ title, dueDate: due || null });
      if (res.ok) {
        setTitle("");
        setDue("");
        router.refresh();
      } else setMessage(res.message);
    });
  }

  function complete(id: string) {
    setMessage(null);
    start(async () => {
      const res = await setTaskStatus(id, "done");
      if (res.ok) router.refresh();
      else setMessage(res.message);
    });
  }

  if (needsMigration) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Tasks aren&apos;t set up yet. Run <code className="rounded bg-[var(--color-surface-3)] px-1">supabase/job-notes-tasks-migration.sql</code> in the Supabase SQL editor, then reload.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder="Add a task or reminder…"
          aria-label="New task"
          className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date (optional)"
          className="h-11 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text-primary)]"
        />
        <Button type="submit" disabled={pending || !title.trim()} className="h-11">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </form>
      {message ? <p className="text-xs text-[var(--color-warning)]">{message}</p> : null}
      {error ? <p className="text-xs text-[var(--color-warning)]">{error}</p> : null}
      {tasks.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">No open tasks. Try saying &ldquo;remind me to bring the dethatcher.&rdquo;</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {tasks.map((t) => {
            const overdue = t.dueDate !== null && t.dueDate < today;
            return (
              <li key={t.id} className="flex items-start gap-3 py-2.5">
                <button type="button" onClick={() => complete(t.id)} aria-label={`Mark done: ${t.title}`} className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                  <Circle className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-text-primary)]">{t.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--color-text-muted)]">
                    {t.dueDate ? <span className={overdue ? "text-[var(--color-warning)]" : ""}>{overdue ? "Overdue · " : "Due "}{t.dueDate}</span> : <span>No due date</span>}
                    {t.source === "voice" ? <Mic className="h-3 w-3" aria-label="Added by voice" /> : null}
                    {t.jobId ? (
                      <Link href={`/jobs/${t.jobId}`} className="text-[var(--color-accent)] hover:underline">
                        Open job
                      </Link>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
