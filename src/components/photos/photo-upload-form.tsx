"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finalizeJobPhotoUpload, prepareJobPhotoUpload } from "@/lib/actions/photos";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WorkSheetExtractionPanel } from "@/components/photos/work-sheet-extraction-panel";

type Status = { kind: "idle" } | { kind: "working"; step: string } | { kind: "error"; message: string } | { kind: "done"; photoId: string };

const BUCKET = "job-photos";

/**
 * Renders inline in the Job, Property and Customer detail pages. The
 * association (job / property / client) is fixed by whichever page renders it,
 * so the owner never picks a record by hand — the page they're on IS the
 * association.
 *
 * The file goes straight from the browser to PRIVATE Storage using a one-time
 * signed upload URL issued by the server, never through a Server Action (those
 * cap request bodies at 1 MB by default and Vercel at ~4.5 MB — smaller than a
 * typical phone photo). The server then verifies the object really exists and
 * records the row. Photos are read back only via short-lived signed URLs.
 */
export function PhotoUploadForm({ jobId, propertyId, clientId }: { jobId?: string; propertyId?: string; clientId?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const working = status.kind === "working";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const request = { name: file.name, type: file.type, size: file.size, jobId: jobId ?? null, propertyId: propertyId ?? null, clientId: clientId ?? null };

    try {
      setStatus({ kind: "working", step: "Preparing…" });
      const prepared = await prepareJobPhotoUpload(request);
      if (!prepared.ok) return setStatus({ kind: "error", message: prepared.message });

      setStatus({ kind: "working", step: "Uploading…" });
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType });
      if (error) return setStatus({ kind: "error", message: `Upload failed: ${error.message}` });

      setStatus({ kind: "working", step: "Saving…" });
      const result = await finalizeJobPhotoUpload({ ...request, path: prepared.path, caption: captionRef.current?.value ?? null });
      if (!result.ok) return setStatus({ kind: "error", message: result.message });

      setStatus({ kind: "done", photoId: result.photoId });
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (captionRef.current) captionRef.current.value = "";
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "The upload failed — check your connection and try again." });
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3">
        <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <Camera className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            capture="environment"
            disabled={working}
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            aria-label="Choose a photo"
            className="min-w-0 flex-1 text-xs text-[var(--color-text-secondary)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--color-surface-3)] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[var(--color-text-primary)]"
          />
        </label>
        <input
          ref={captionRef}
          type="text"
          name="caption"
          placeholder="Caption (optional)"
          disabled={working}
          className="h-11 min-w-0 flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] px-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none sm:h-10"
        />
        <Button type="submit" variant="secondary" disabled={working || !fileName} className="h-11 shrink-0 sm:h-10">
          {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Upload"}
        </Button>
        {working ? <p className="w-full text-xs text-[var(--color-text-secondary)]">{status.step}</p> : null}
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
      {status.kind === "done" && propertyId ? <WorkSheetExtractionPanel photoId={status.photoId} propertyId={propertyId} /> : null}
    </div>
  );
}
