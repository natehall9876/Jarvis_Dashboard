import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { runAutomaticHomeworksSync } from "@/lib/integrations/homeworks-auto-worker";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret = process.env.HOMEWORKS_SYNC_SECRET;
  if (!secret) return Response.json({ error: "Scheduled Homeworks sync is not configured" }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runAutomaticHomeworksSync();
    if (result.records > 0) revalidatePath("/", "layout");
    return Response.json(result, { status: result.status === "failed" ? 503 : 200, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Homeworks sync unavailable; the next scheduled run will retry" }, { status: 503 });
  }
}
