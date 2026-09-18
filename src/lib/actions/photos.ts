"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractWorkSheetInfo, type WorkSheetExtraction } from "@/lib/ai/work-sheet-extraction";
import { insertJob } from "@/lib/actions/jobs";
import { logActivity } from "@/lib/data/activity-log";
import { getPropertyById } from "@/lib/data/properties";
import { clientDisplayName, propertyAddress } from "@/lib/format";

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

export type ExtractPhotoResult = { ok: true; data: WorkSheetExtraction } | { ok: false; message: string };

/**
 * Reads a previously-uploaded photo back out of private Storage and runs it
 * through vision-based extraction. Never writes anything — the result is
 * for the owner to review, correct, and explicitly save via
 * createJobFromWorkSheet below. Nothing here is a confirmed business record
 * yet, matching the same propose-then-confirm discipline as every other
 * write path in this app.
 */
export async function extractPhotoInfo(photoId: string): Promise<ExtractPhotoResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { data: photo, error: photoError } = await supabase
    .from("job_photos")
    .select("storage_path, content_type")
    .eq("id", photoId)
    .single();
  if (photoError || !photo) return { ok: false, message: "That photo couldn't be found." };

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(JOB_PHOTOS_BUCKET).download(photo.storage_path);
  if (downloadError || !fileBlob) return { ok: false, message: `Couldn't read the photo: ${downloadError?.message ?? "unknown error"}` };

  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = photo.content_type || "image/jpeg";

  const result = await extractWorkSheetInfo(base64, mediaType);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, data: result.data };
}

export type CreateJobFromWorkSheetResult = { ok: true; jobId: string } | { ok: false; message: string };

/**
 * Saves a work-sheet extraction as a real completed job — only ever called
 * with values the owner has already reviewed and possibly corrected in the
 * UI, never the raw extraction directly. Reuses insertJob (the same
 * function the manual Create Job form and the AI's propose_create_job use)
 * rather than a parallel write path.
 */
export async function createJobFromWorkSheet(formData: FormData): Promise<CreateJobFromWorkSheetResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const propertyId = optional(formData, "property_id");
  if (!propertyId) return { ok: false, message: "A property is required to save this as a job." };

  const property = await getPropertyById(propertyId);
  if (property.error !== null || !property.data) return { ok: false, message: "That property couldn't be found." };

  const scheduledDate = optional(formData, "scheduled_date");
  const priceRaw = optional(formData, "price");
  const hoursRaw = optional(formData, "actual_hours");
  const price = priceRaw !== null ? Number(priceRaw) : null;
  const actualHours = hoursRaw !== null ? Number(hoursRaw) : null;
  const notes = optional(formData, "notes");
  const photoId = optional(formData, "photo_id");

  try {
    const jobId = await insertJob(
      {
        property_id: propertyId,
        scheduled_date: scheduledDate,
        price: price !== null && Number.isFinite(price) ? price : null,
        actual_hours: actualHours !== null && Number.isFinite(actualHours) ? actualHours : null,
        notes,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      [],
    );

    // Link the source photo to the job it was extracted into, so the
    // original image stays reachable from the record it produced.
    if (photoId) {
      await supabase.from("job_photos").update({ job_id: jobId }).eq("id", photoId);
    }

    await logActivity({
      entityType: "job",
      entityId: jobId,
      eventType: "job_created",
      summary: `Job logged from a work-sheet photo for ${clientDisplayName(property.data.client)} — ${propertyAddress(property.data.property)}`,
      detail: { property_id: propertyId, scheduled_date: scheduledDate, price, source_photo_id: photoId, via: "work_sheet_extraction" },
      source: "owner",
    });

    revalidatePath(`/properties/${propertyId}`);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true, jobId };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't save this as a job." };
  }
}
