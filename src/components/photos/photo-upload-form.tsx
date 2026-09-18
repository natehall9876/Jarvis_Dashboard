"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadJobPhoto } from "@/lib/actions/photos";

type Status = { kind: "idle" } | { kind: "error"; message: string } | { kind: "done" };

/**
 * Renders inline in the Job and Property detail pages' existing "Photos"
 * cards — not a separate page. Association (job_id/property_id/client_id)
 * is fixed by whichever detail page renders this, so the owner never has to
 * pick a customer/property/job by hand; the context they're already looking
 * at IS the association.
 */
export function PhotoUploadForm({ jobId, propertyId, clientId }: { jobId?: string; propertyId?: string; clientId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (jobId) formData.set("job_id", jobId);
    if (propertyId) formData.set("property_id", propertyId);
    if (clientId) formData.set("client_id", clientId);

    startTransition(async () => {
      const result = await uploadJobPhoto(formData);
      if (result.ok) {
        setStatus({ kind: "done" });
        setFileName(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } else {
        setStatus({ kind: "error", message: result.message });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3"
    >
      <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <Camera className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        <input
          ref={fileInputRef}
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          disabled={pending}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="min-w-0 flex-1 text-xs text-[var(--color-text-secondary)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--color-surface-3)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--color-text-primary)]"
        />
      </label>
      <input
        type="text"
        name="caption"
        placeholder="Caption (optional)"
        disabled={pending}
        className="min-w-0 flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <Button type="submit" variant="secondary" disabled={pending || !fileName} className="shrink-0">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Upload"}
      </Button>
      {status.kind === "error" ? (
        <p className="flex w-full items-center gap-1.5 text-xs text-[var(--color-critical)]">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {status.message}
        </p>
      ) : null}
      {status.kind === "done" ? (
        <p className="flex w-full items-center gap-1.5 text-xs text-[var(--color-accent)]">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Photo uploaded and saved.
        </p>
      ) : null}
    </form>
  );
}
