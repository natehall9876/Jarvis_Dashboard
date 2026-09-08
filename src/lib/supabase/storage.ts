import { supabaseEnv } from "@/lib/env";

/**
 * job_photos.storage_path stores a path inside Supabase Storage, not a
 * public URL. This assumes a public bucket named "job-photos" — if your
 * bucket is named differently or is private, update JOB_PHOTOS_BUCKET below
 * (and switch to a signed-URL fetch server-side if the bucket is private).
 */
const JOB_PHOTOS_BUCKET = "job-photos";

export function getJobPhotoUrl(storagePath: string): string {
  return `${supabaseEnv.url}/storage/v1/object/public/${JOB_PHOTOS_BUCKET}/${storagePath}`;
}
