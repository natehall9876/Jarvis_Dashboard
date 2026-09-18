"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

type PreviewRow = { homeworks_id: string; entity_type: string; action: "create" | "update" | "would_fail"; error?: string };
type PreviewResponse = { ok: true; dry_run: true; total: number; would_create: number; would_update: number; would_fail: number; preview: PreviewRow[] };

type ImportRow = { homeworks_id: string; entity_type: string; ok: boolean; id?: string; error?: string };
type ImportResponse = { ok: true; total: number; succeeded: number; failed: number; results: ImportRow[] };

type State =
  | { phase: "idle" }
  | { phase: "previewing" }
  | { phase: "previewed"; preview: PreviewResponse; rawRecords: unknown[] }
  | { phase: "importing"; rawRecords: unknown[] }
  | { phase: "imported"; result: ImportResponse }
  | { phase: "error"; message: string };

export function HomeworksImportForm() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  function parseRecords(): unknown[] | null {
    try {
      const parsed = JSON.parse(input);
      const records = Array.isArray(parsed) ? parsed : parsed?.records;
      if (!Array.isArray(records)) throw new Error("not an array");
      return records;
    } catch {
      setState({ phase: "error", message: "Couldn't parse that as JSON — expected either an array of records, or {\"records\":[...]}." });
      return null;
    }
  }

  async function preview() {
    const records = parseRecords();
    if (!records) return;
    setState({ phase: "previewing" });
    try {
      const res = await fetch("/api/integrations/homeworks/admin-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records, dry_run: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? "Preview failed." });
        return;
      }
      setState({ phase: "previewed", preview: json as PreviewResponse, rawRecords: records });
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  async function confirmImport(rawRecords: unknown[]) {
    setState({ phase: "importing", rawRecords });
    try {
      const res = await fetch("/api/integrations/homeworks/admin-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ records: rawRecords }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? "Import failed." });
        return;
      }
      setState({ phase: "imported", result: json as ImportResponse });
    } catch {
      setState({ phase: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }

  const busy = state.phase === "previewing" || state.phase === "importing";

  return (
    <Card>
      <CardHeader title="Import records" description="Nothing is written until you click Confirm on a reviewed preview." />
      <CardBody className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (state.phase !== "idle") setState({ phase: "idle" });
          }}
          disabled={busy}
          placeholder={`{"records":[{"entity_type":"customer","homeworks_id":"123","first_name":"Jane","last_name":"Doe"}]}`}
          rows={8}
          className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
        />

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={preview} disabled={busy || !input.trim()}>
            {state.phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Preview
          </Button>
          {state.phase === "previewed" || state.phase === "importing" ? (
            <Button
              type="button"
              onClick={state.phase === "previewed" ? () => confirmImport(state.rawRecords) : undefined}
              disabled={busy}
            >
              {state.phase === "importing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {state.phase === "previewed"
                ? `Confirm Import (${state.preview.would_create + state.preview.would_update} record${state.preview.would_create + state.preview.would_update === 1 ? "" : "s"})`
                : "Importing..."}
            </Button>
          ) : null}
        </div>

        {state.phase === "error" ? (
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-critical)]/30 bg-[var(--color-critical-soft)] px-3 py-2 text-sm text-[var(--color-critical)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {state.message}
          </div>
        ) : null}

        {state.phase === "previewed" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-[var(--color-accent)]">{state.preview.would_create} would create</span>
              <span className="rounded-full bg-[var(--color-surface-3)] px-3 py-1 text-[var(--color-text-secondary)]">{state.preview.would_update} would update</span>
              {state.preview.would_fail > 0 ? (
                <span className="rounded-full bg-[var(--color-critical-soft)] px-3 py-1 text-[var(--color-critical)]">{state.preview.would_fail} would fail</span>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Homeworks ID</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.preview.preview.map((row, i) => (
                    <tr key={i} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2 text-[var(--color-text-secondary)]">{row.entity_type}</td>
                      <td className="px-3 py-2 font-mono text-[var(--color-text-secondary)]">{row.homeworks_id}</td>
                      <td className="px-3 py-2">
                        {row.action === "create" ? (
                          <span className="text-[var(--color-accent)]">Create</span>
                        ) : row.action === "update" ? (
                          <span className="text-[var(--color-text-secondary)]">Update</span>
                        ) : (
                          <span className="text-[var(--color-critical)]" title={row.error}>
                            Would fail: {row.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {state.phase === "imported" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
              <span>
                {state.result.succeeded} of {state.result.total} record{state.result.total === 1 ? "" : "s"} imported successfully.
              </span>
            </div>
            {state.result.failed > 0 ? (
              <div className="space-y-1">
                {state.result.results
                  .filter((r) => !r.ok)
                  .map((r, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-critical)]">
                      <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                      {r.entity_type} {r.homeworks_id}: {r.error}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
