"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractWorkSheetInfo, type WorkSheetExtraction } from "@/lib/ai/work-sheet-extraction";
import { insertJob } from "@/lib/actions/jobs";
import { logActivity } from "@/lib/data/activity-log";
import { getPropertyById } from "@/lib/data/properties";
import { clientDisplayName, propertyAddress } from "@/lib/format";
import { MAX_PHOTO_BYTES, buildStoragePath, isOwnStoragePath, validatePhotoRequest, type PhotoRequest } from "@/lib/jarvis/photo-validation";

const JOB_PHOTOS_BUCKET = "job-photos";
export type UploadPhotoResult = { ok: true; photoId: string } | { ok: false; message: string };
export type PreparedUpload = { ok: true; path: string; token: string; contentType: string } | { ok: false; message: string };

/**
 * Photo intake is a three-step flow that never sends image bytes through a
 * Server Action (those are capped at 1 MB by default, and Vercel functions at
 * about 4.5 MB — almost every phone photo is larger):
 *   1. prepareJobPhotoUpload  — validates the request and issues a one-time
 *      signed upload URL for a path inside the caller's own folder.
 *   2. the browser uploads the file directly to PRIVATE Storage with that token.
 *   3. finalizeJobPhotoUpload — confirms the object really exists (and its real
 *      size/type), then records the job_photos row tied to a job/property/client.
 * Everything runs under the owner's own authenticated session and RLS; the
 * service-role client is never used. Photos are only ever read back through
 * short-lived signed URLs (lib/supabase/storage.ts).
 */
export async function prepareJobPhotoUpload(req: PhotoRequest): Promise<PreparedUpload> {
  const valid = validatePhotoRequest(req);
  if (!valid.ok) return valid;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in to upload a photo." };

  const path = buildStoragePath(user.id, randomUUID(), req.name);
  const { data, error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: `Couldn't start the upload: ${error?.message ?? "no upload URL returned"}` };
  return { ok: true, path, token: data.token, contentType: valid.contentType };
}

export async function finalizeJobPhotoUpload(input: PhotoRequest & { path: string; caption?: string | null }): Promise<UploadPhotoResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in to upload a photo." };
  if (!isOwnStoragePath(user.id, input.path)) return { ok: false, message: "Invalid upload path." };

  const valid = validatePhotoRequest(input);
  if (!valid.ok) {
    await supabase.storage.from(JOB_PHOTOS_BUCKET).remove([input.path]);
    return valid;
  }

  // Verify against what Storage actually holds, not what the browser claims.
  //
  // A direct single-object lookup (createSignedUrl) rather than a folder
  // listing filtered by `search` — a prior version used list(folder,
  // {search: fileName}), which depends on how the storage backend's search
  // filter matches, and on a naive read didn't obviously guarantee an exact
  // match. createSignedUrl targets the exact path and fails outright if the
  // object isn't there, which is the more direct existence proof. Retried
  // with backoff either way, since Storage can briefly lag behind a
  // just-completed upload (eventual consistency) — a real, successfully-
  // uploaded photo must not be reported as failed just because this check
  // ran a moment too early.
  const folder = user.id;
  const fileName = input.path.slice(folder.length + 1);
  let exists = false;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5 && !exists; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    const { error } = await supabase.storage.from(JOB_PHOTOS_BUCKET).createSignedUrl(input.path, 60);
    if (!error) exists = true;
    else lastError = error.message;
  }
  if (!exists) {
    return { ok: false, message: `The upload didn't reach storage in time — please try again.${lastError ? ` (${lastError})` : ""}` };
  }

  // Best-effort size lookup for the oversized-file defense below — a client
  // that bypasses the browser's own size check could otherwise upload past
  // the limit directly against the signed URL. If this can't be read (e.g.
  // metadata not yet populated), fall back to what the client reported
  // rather than failing an upload we've already confirmed exists.
  const { data: listed } = await supabase.storage.from(JOB_PHOTOS_BUCKET).list(folder, { search: fileName, limit: 5 });
  const object = listed?.find((o) => o.name === fileName);
  const realSize = Number((object?.metadata as { size?: number } | null)?.size ?? input.size);
  if (realSize > MAX_PHOTO_BYTES) {
    await supabase.storage.from(JOB_PHOTOS_BUCKET).remove([input.path]);
    return { ok: false, message: "That file is too large (15 MB max)." };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("job_photos")
    .insert({
      job_id: input.jobId ?? null,
      property_id: input.propertyId ?? null,
      client_id: input.clientId ?? null,
      caption: input.caption?.trim() || null,
      storage_path: input.path,
      original_filename: input.name || null,
      content_type: valid.contentType,
      size_bytes: realSize,
      uploaded_by: user.id,
      source: "owner_upload",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // The object is already in Storage but the DB row failed — remove it so a retry leaves no orphan.
    await supabase.storage.from(JOB_PHOTOS_BUCKET).remove([input.path]);
    return { ok: false, message: insertError?.message ?? "Couldn't save the photo record." };
  }

  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  if (input.propertyId) revalidatePath(`/properties/${input.propertyId}`);
  if (input.clientId) revalidatePath(`/clients/${input.clientId}`);
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
