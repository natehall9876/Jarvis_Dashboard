"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const JOB_PHOTOS_BUCKET = "job-photos";
const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export type UploadPhotoResult = { ok: true; photoId: string } | { ok: false; message: string };

/**
 * Uploads through the owner's own authenticated Supabase client — not the
 * service-role admin client — so this is bound by the same RLS policies as
 * everything else a signed-in owner does. Requires at least one of
 * job_id/property_id/client_id (job_photos_has_association, see
 * supabase/photo-upload-migration.sql) so a photo is never orphaned.
 */
export async function uploadJobPhoto(formData: FormData): Promise<UploadPhotoResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a photo to upload." };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, message: "That file is too large (15MB max)." };
  }
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return { ok: false, message: "Unsupported file type — use JPEG, PNG, WEBP, or HEIC." };
  }

  const jobId = optional(formData, "job_id");
  const propertyId = optional(formData, "property_id");
  const clientId = optional(formData, "client_id");
  const caption = optional(formData, "caption");
  if (!jobId && !propertyId && !clientId) {
    return { ok: false, message: "A photo needs to be tied to a job, property, or client." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in to upload a photo." };

  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const storagePath = `${user.id}/${randomUUID()}${extension}`;

  const buffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(JOB_PHOTOS_BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { ok: false, message: `Upload failed: ${uploadError.message}` };

  const { data: inserted, error: insertError } = await supabase
    .from("job_photos")
    .insert({
      job_id: jobId,
      property_id: propertyId,
      client_id: clientId,
      caption,
      storage_path: storagePath,
      original_filename: file.name || null,
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
      source: "owner_upload",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // The file is already in Storage but the DB row failed — clean up so a
    // retry doesn't leave an orphaned object with no record pointing to it.
    await supabase.storage.from(JOB_PHOTOS_BUCKET).remove([storagePath]);
    return { ok: false, message: insertError?.message ?? "Couldn't save the photo record." };
  }

  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (propertyId) revalidatePath(`/properties/${propertyId}`);

  return { ok: true, photoId: inserted.id as string };
}

function optional(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
