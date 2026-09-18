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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Signs a whole batch of photos at once — one round trip instead of one per photo in a grid. */
export async function getJobPhotoUrls(storagePaths: string[]): Promise<Map<string, string>> {
  if (storagePaths.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return new Map();
  const map = new Map<string, string>();
  for (const entry of data) {
    if (!entry.error && entry.signedUrl) map.set(entry.path ?? "", entry.signedUrl);
  }
  return map;
}
