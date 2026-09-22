import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * job_photos.storage_path stores a path inside Supabase Storage. The
 * "job-photos" bucket is PRIVATE (supabase/photo-upload-migration.sql) —
 * customer photos must never be reachable via a public URL, so every read
 * goes through a short-lived signed URL instead of a permanent public link.
 */
const JOB_PHOTOS_BUCKET = "job-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function getJobPhotoUrl(storagePath: string): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export type JobPhotoUrlsResult = { urls: Map<string, string>; error: string | null };

/**
 * Signs a whole batch of photos at once — one round trip instead of one per
 * photo in a grid. Never throws (wrapped so a Storage outage degrades the
 * photos section, not the whole job page) and distinguishes "the batch call
 * itself failed" from "some individual photos didn't resolve" via `error` —
 * the caller can then show an honest "photos unavailable right now" instead
 * of silently rendering as if there were zero photos.
 */
export async function getJobPhotoUrls(storagePaths: string[]): Promise<JobPhotoUrlsResult> {
  if (storagePaths.length === 0) return { urls: new Map(), error: null };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
    if (error) return { urls: new Map(), error: error.message };
    if (!data) return { urls: new Map(), error: "Storage returned no data." };
    const map = new Map<string, string>();
    for (const entry of data) {
      if (!entry.error && entry.signedUrl) map.set(entry.path ?? "", entry.signedUrl);
    }
    return { urls: map, error: null };
  } catch (err) {
    return { urls: new Map(), error: err instanceof Error ? err.message : "Couldn't reach photo storage." };
  }
}
