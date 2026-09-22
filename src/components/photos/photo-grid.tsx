"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, TriangleAlert, X } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { deletePhoto } from "@/lib/actions/photos";

export type PhotoGridItem = {
  id: string;
  storage_path: string;
  caption: string | null;
  photo_type: string | null;
};

/**
 * The photo grid shared by the Job, Property, and Client detail pages —
 * previously ~25 lines of near-identical JSX hand-copied into all three,
 * with no delete control at all. Pulled into one component so the delete
 * flow (auth, confirmation, error handling) exists exactly once instead of
 * needing to be gotten right three times.
 *
 * Delete calls the real server action directly (not a native form submit)
 * so this can track per-photo loading/success/failure state and show it —
 * the same pattern PhotoUploadForm already uses for upload. On success,
 * router.refresh() re-fetches the page's real Server Component data rather
 * than just removing the tile from local state, which is what makes "the
 * photo stays deleted after a full page refresh" actually true rather than
 * just look true until the next navigation.
 */
export function PhotoGrid({
  photos,
  photoUrls,
  photoUrlsError,
  emptyTitle = "No photos yet",
  emptyDescription,
}: {
  photos: PhotoGridItem[];
  photoUrls: Map<string, string>;
  photoUrlsError: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  async function handleDelete(photo: PhotoGridItem) {
    if (!window.confirm("Delete this photo? This can't be undone.")) return;
    setRowError(null);
    setDeletingId(photo.id);
    try {
      const result = await deletePhoto(photo.id);
      if (!result.ok) {
        setRowError({ id: photo.id, message: result.message });
        return;
      }
      if (previewId === photo.id) setPreviewId(null);
      router.refresh();
    } catch (err) {
      setRowError({ id: photo.id, message: err instanceof Error ? err.message : "Couldn't delete this photo — check your connection and try again." });
    } finally {
      setDeletingId(null);
    }
  }

  if (photos.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  const preview = previewId ? photos.find((p) => p.id === previewId) : null;
  const previewUrl = preview ? photoUrls.get(preview.storage_path) : null;

  return (
    <div className="space-y-2">
      {photoUrlsError ? (
        <p className="flex items-start gap-1.5 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2 text-xs text-[var(--color-warning)]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Photo previews are temporarily unavailable ({photoUrlsError}) — the {photos.length} file{photos.length === 1 ? "" : "s"} on record are unaffected.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((photo) => {
          const url = photoUrls.get(photo.storage_path);
          const deleting = deletingId === photo.id;
          return (
            <div key={photo.id} className="group relative overflow-hidden rounded-lg border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => url && setPreviewId(photo.id)}
                disabled={!url}
                aria-label={`View ${photo.caption ?? photo.photo_type ?? "photo"} full size`}
                className="block h-28 w-full disabled:cursor-default"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={photo.caption ?? photo.photo_type ?? "Job photo"} className="h-28 w-full object-cover" />
                ) : (
                  <div className="flex h-28 w-full items-center justify-center bg-[var(--color-surface-2)] text-[10px] text-[var(--color-text-muted)]">Unavailable</div>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(photo)}
                disabled={deleting}
                aria-label={`Delete ${photo.caption ?? photo.photo_type ?? "photo"}`}
                className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-100 transition-opacity hover:bg-[var(--color-critical)] focus-visible:opacity-100 disabled:opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{photo.caption ?? photo.photo_type ?? "Photo"}</div>
              {rowError?.id === photo.id ? (
                <p className="flex items-start gap-1 bg-[var(--color-critical-soft)] px-2 py-1 text-[10px] text-[var(--color-critical)]">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  {rowError.message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {preview && previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          onClick={() => setPreviewId(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewId(null)}
            aria-label="Close preview"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface-1)]/90 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={preview.caption ?? preview.photo_type ?? "Job photo"}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {preview.caption ? (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1.5 text-sm text-white">{preview.caption}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
