"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileSearch, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractPhotoInfo, createJobFromWorkSheet, type ExtractPhotoResult } from "@/lib/actions/photos";
import type { WorkSheetExtraction } from "@/lib/ai/work-sheet-extraction";

type State =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "error"; message: string }
  | { kind: "review"; data: WorkSheetExtraction }
  | { kind: "saving" }
  | { kind: "saved" };

/**
 * Appears next to a just-uploaded photo on a Property page — "read this
 * work sheet" is deliberately a separate, owner-initiated step from
 * uploading, not automatic, so nothing gets interpreted (or billed in API
 * cost) without being asked for. Never writes a job directly: extraction
 * fills an editable form, and only an explicit Save turns it into a real
 * record, via the same insertJob path every other job-creation route uses.
 */
export function WorkSheetExtractionPanel({ photoId, propertyId }: { photoId: string; propertyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState({ scheduled_date: "", price: "", actual_hours: "", notes: "" });

  function runExtraction() {
    setState({ kind: "extracting" });
    startTransition(async () => {
      const result: ExtractPhotoResult = await extractPhotoInfo(photoId);
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      const d = result.data;
      setFields({
        scheduled_date: d.date_confidence === "exact" && d.work_date_guess ? d.work_date_guess : "",
        price: d.price_guess !== null ? String(d.price_guess) : "",
        actual_hours: d.hours_worked_guess !== null ? String(d.hours_worked_guess) : "",
        notes: [d.service_description, d.notes, d.employees_mentioned.length ? `Crew mentioned: ${d.employees_mentioned.join(", ")}` : null]
          .filter(Boolean)
          .join("\n"),
      });
      setState({ kind: "review", data: d });
    });
  }

  function save() {
    setState((s) => (s.kind === "review" ? { kind: "saving" } : s));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("property_id", propertyId);
      formData.set("photo_id", photoId);
      if (fields.scheduled_date) formData.set("scheduled_date", fields.scheduled_date);
      if (fields.price) formData.set("price", fields.price);
      if (fields.actual_hours) formData.set("actual_hours", fields.actual_hours);
      if (fields.notes) formData.set("notes", fields.notes);

      const result = await createJobFromWorkSheet(formData);
      if (result.ok) {
        setState({ kind: "saved" });
        router.refresh();
      } else {
        setState({ kind: "error", message: result.message });
      }
    });
  }

  if (state.kind === "idle" || state.kind === "error") {
    return (
      <div className="space-y-1.5">
        <Button type="button" variant="secondary" onClick={runExtraction} disabled={pending}>
          <FileSearch className="h-3.5 w-3.5" />
          Read this as a work sheet
        </Button>
        {state.kind === "error" ? (
          <p className="flex items-center gap-1.5 text-xs text-[var(--color-critical)]">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  if (state.kind === "extracting") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Reading the photo...
      </p>
    );
  }

  if (state.kind === "saved") {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)]">
        <Check className="h-3.5 w-3.5" />
        Saved as a completed job.
      </p>
    );
  }

  // review or saving
  const data = state.kind === "review" ? state.data : null;
  return (
    <div className="space-y-2.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-3">
      {data && !data.legible ? (
        <p className="flex items-start gap-1.5 text-xs text-[var(--color-warning)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Couldn&apos;t read this clearly enough to extract much — check the fields below and fill in what you know.
        </p>
      ) : null}
      {data?.customer_name_guess || data?.property_address_guess ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Mentions on the sheet — customer: <span className="text-[var(--color-text-secondary)]">{data.customer_name_guess ?? "—"}</span>, property:{" "}
          <span className="text-[var(--color-text-secondary)]">{data.property_address_guess ?? "—"}</span>. This job will be saved under the property
          you&apos;re currently viewing — check these match before saving.
        </p>
      ) : null}
      {data && data.uncertain_fields.length > 0 ? (
        <p className="text-xs text-[var(--color-warning)]">Uncertain: {data.uncertain_fields.join(", ")} — double-check before saving.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[var(--color-text-muted)]">
          Date
          <input
            type="date"
            value={fields.scheduled_date}
            onChange={(e) => setFields((f) => ({ ...f, scheduled_date: e.target.value }))}
            className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">
          Price
          <input
            type="number"
            step="0.01"
            value={fields.price}
            onChange={(e) => setFields((f) => ({ ...f, price: e.target.value }))}
            className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        <label className="text-xs text-[var(--color-text-muted)]">
          Hours worked
          <input
            type="number"
            step="0.1"
            value={fields.actual_hours}
            onChange={(e) => setFields((f) => ({ ...f, actual_hours: e.target.value }))}
            className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
      </div>
      <label className="block text-xs text-[var(--color-text-muted)]">
        Notes
        <textarea
          rows={3}
          value={fields.notes}
          onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
          className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>

      <Button type="button" onClick={save} disabled={pending} className="w-full justify-center">
        {state.kind === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save as completed job on this property
      </Button>
    </div>
  );
}
