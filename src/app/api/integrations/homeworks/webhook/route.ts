import { NextResponse } from "next/server";
import { homeworksWebhookEnv } from "@/lib/env.server";
import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";
import { INVALID_SECRET_MESSAGE } from "@/lib/integrations/homeworks-sync-failures";

/** Retired projection writer. Authenticate legacy callers, then reject without I/O. */
export async function POST(request: Request) {
  if (!homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Homeworks webhook is not configured (HOMEWORKS_WEBHOOK_SECRET missing)." }, { status: 503 });
  }
  if (request.headers.get("x-homeworks-webhook-secret") !== homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: INVALID_SECRET_MESSAGE }, { status: 401 });
  }
  return NextResponse.json({ error: LEGACY_HOMEWORKS_WRITE_DISABLED }, { status: 410 });
}
