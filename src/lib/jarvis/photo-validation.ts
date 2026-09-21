/**
 * Pure rules for photo intake, shared by the prepare and finalize steps so the
 * browser can never widen what the server accepts.
 */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

/** Some mobile browsers report an empty type for HEIC files; infer it from the extension instead of rejecting. */
export function resolvePhotoType(name: string, reportedType: string): string {
  if (reportedType) return reportedType.toLowerCase();
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" }[ext] ?? "";
}

export type PhotoRequest = { name: string; type: string; size: number; jobId?: string | null; propertyId?: string | null; clientId?: string | null };

export function validatePhotoRequest(req: PhotoRequest): { ok: true; contentType: string } | { ok: false; message: string } {
  if (!req.name || !Number.isFinite(req.size) || req.size <= 0) return { ok: false, message: "Choose a photo to upload." };
  if (req.size > MAX_PHOTO_BYTES) return { ok: false, message: "That file is too large (15 MB max)." };
  const contentType = resolvePhotoType(req.name, req.type);
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(contentType)) return { ok: false, message: "Unsupported file type — use JPEG, PNG, WEBP, or HEIC." };
  if (!req.jobId && !req.propertyId && !req.clientId) return { ok: false, message: "A photo needs to be tied to a job, property, or client." };
  return { ok: true, contentType };
}

/** `<userId>/<uuid>.<ext>` — the extension is reduced to safe characters so a filename can never shape the path. */
export function buildStoragePath(userId: string, uuid: string, filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const raw = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  return `${userId}/${uuid}${ext ? `.${ext}` : ""}`;
}

/** A finalize request may only reference an object inside the caller's own folder. */
export function isOwnStoragePath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.slice(userId.length + 1).includes("/") && !path.includes("..");
}
