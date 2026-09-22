import { test, expect } from "@playwright/test";
import { MAX_PHOTO_BYTES, buildStoragePath, isOwnStoragePath, resolvePhotoType, validatePhotoRequest } from "../src/lib/jarvis/photo-validation";
import { deletePhoto } from "../src/lib/actions/photos";

// Pure-logic tests. The actual upload to Supabase Storage and the signed-URL read-back
// need a signed-in session and the real bucket, and are NOT covered here — see the report.

const ok = { name: "IMG_1.jpg", type: "image/jpeg", size: 3_000_000, jobId: "j1" };

test.describe("photo request validation", () => {
  test("a normal phone photo tied to a job is accepted", () => {
    expect(validatePhotoRequest(ok)).toEqual({ ok: true, contentType: "image/jpeg" });
  });
  test("a photo can be tied to a property or a customer instead of a job", () => {
    expect(validatePhotoRequest({ ...ok, jobId: null, propertyId: "p1" }).ok).toBe(true);
    expect(validatePhotoRequest({ ...ok, jobId: null, clientId: "c1" }).ok).toBe(true);
  });
  test("an unassociated photo is rejected — it would be an orphan nothing can show", () => {
    const r = validatePhotoRequest({ ...ok, jobId: null });
    expect(r.ok).toBe(false);
  });
  test("files over 15 MB are rejected, files at the limit pass", () => {
    expect(validatePhotoRequest({ ...ok, size: MAX_PHOTO_BYTES + 1 }).ok).toBe(false);
    expect(validatePhotoRequest({ ...ok, size: MAX_PHOTO_BYTES }).ok).toBe(true);
  });
  test("photos larger than the old 1 MB Server Action limit are valid (they no longer go through one)", () => {
    expect(validatePhotoRequest({ ...ok, size: 8_000_000 }).ok).toBe(true);
  });
  test("empty files and non-image types are rejected", () => {
    expect(validatePhotoRequest({ ...ok, size: 0 }).ok).toBe(false);
    expect(validatePhotoRequest({ ...ok, name: "x.pdf", type: "application/pdf" }).ok).toBe(false);
    expect(validatePhotoRequest({ ...ok, name: "x.exe", type: "" }).ok).toBe(false);
  });
  test("HEIC files with no reported type (common on mobile browsers) are inferred from the extension", () => {
    expect(resolvePhotoType("IMG_0042.HEIC", "")).toBe("image/heic");
    expect(validatePhotoRequest({ ...ok, name: "IMG_0042.HEIC", type: "" })).toEqual({ ok: true, contentType: "image/heic" });
  });
});

test.describe("storage path safety", () => {
  test("paths live in the caller's own folder and never trust the filename", () => {
    expect(buildStoragePath("user-1", "uuid-1", "IMG 1.JPG")).toBe("user-1/uuid-1.jpg");
    expect(buildStoragePath("user-1", "uuid-1", "../../etc/passwd")).toBe("user-1/uuid-1");
    expect(buildStoragePath("user-1", "uuid-1", "noext")).toBe("user-1/uuid-1");
    expect(buildStoragePath("user-1", "uuid-1", "a.<script>")).toBe("user-1/uuid-1.scrip"); // symbols dropped, extension capped at 5 chars
    expect(buildStoragePath("user-1", "uuid-1", "C:\\temp\\evil.png")).toBe("user-1/uuid-1.png");
  });
  test("a finalize request can only reference an object inside the caller's own folder", () => {
    expect(isOwnStoragePath("user-1", "user-1/abc.jpg")).toBe(true);
    expect(isOwnStoragePath("user-1", "user-2/abc.jpg")).toBe(false);
    expect(isOwnStoragePath("user-1", "user-1/../user-2/abc.jpg")).toBe(false);
    expect(isOwnStoragePath("user-1", "user-1/sub/abc.jpg")).toBe(false);
    expect(isOwnStoragePath("user-1", "user-10/abc.jpg")).toBe(false);
  });
});

/**
 * deletePhoto never accepts a storage path from the caller — only a photo
 * id, with the real path always resolved server-side from the job_photos
 * row (see photos.ts's own doc comment on the function). What's directly
 * testable from a Node context with no real signed-in session (this
 * environment has no test account — see docs/TESTING.md) is the property
 * that matters most for authorization: there is no way to call this
 * function and get `ok: true` back without a real, authenticated request.
 * deletePhoto wraps its entire body in try/catch specifically so this is
 * observable as a clean typed result rather than an uncaught exception —
 * calling it here, outside of any Next.js request scope, exercises that
 * exact path (createSupabaseServerClient() has no cookies() context to
 * read and fails before ever reaching auth.getUser()).
 */
test.describe("photo deletion authorization", () => {
  test("an empty photo id is rejected before any database or auth call", async () => {
    const result = await deletePhoto("");
    expect(result).toEqual({ ok: false, message: "No photo specified." });
  });

  test("deletion can never succeed without a real authenticated session — never throws, never returns ok:true", async () => {
    const result = await deletePhoto("11111111-1111-1111-1111-111111111111");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  test("a made-up, non-existent photo id behaves the same as any other unauthenticated call (fails closed, not open)", async () => {
    // Two different callers, two different fake ids — neither should ever
    // succeed, and neither should throw regardless of what id is supplied.
    const a = await deletePhoto("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const b = await deletePhoto("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });
});
