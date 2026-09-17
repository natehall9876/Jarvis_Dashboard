import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { homeworksWebhookEnv } from "@/lib/env";
import { isValidHomeworksSyncPayload, syncHomeworksEntity } from "@/lib/integrations/homeworks-sync";

/**
 * Receives events from a Zapier "Webhooks by Zapier" action, triggered by
 * one of Homeworks' native Zapier triggers (New Customer, New Property,
 * New Invoice, New Payment, etc. — homeworks.com/product/integrations).
 * This is the officially supported Homeworks integration path; there is no
 * documented direct Homeworks API, so this project does not invent one.
 *
 * This endpoint defines its OWN expected JSON shape — the exact mapping
 * from Homeworks' real fields into that shape happens inside Zapier's own
 * field-mapping UI when the Zap is built, so nothing here guesses at
 * Homeworks' internal field names. See lib/integrations/homeworks-sync.ts
 * for the exact shape and the shared upsert logic (also used by the bulk
 * backfill endpoint at ../import/route.ts).
 *
 * Auth: a shared secret in the `x-homeworks-webhook-secret` header, checked
 * against HOMEWORKS_WEBHOOK_SECRET — there is no Supabase Auth session for
 * a server-to-server call like this to present, so this is the only gate.
 * On success, writes go through the service-role client (the one narrow,
 * documented exception to this project's no-service-role-key rule — see
 * lib/supabase/admin.ts) since RLS's `to authenticated` policy has no
 * session here to authorize against.
 */
export async function POST(request: Request) {
  if (!homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Homeworks webhook is not configured (HOMEWORKS_WEBHOOK_SECRET missing)." }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-homeworks-webhook-secret");
  if (providedSecret !== homeworksWebhookEnv.secret) {
    return NextResponse.json({ error: "Invalid or missing webhook secret." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isValidHomeworksSyncPayload(body)) {
    return NextResponse.json(
      { error: "Body must include entity_type ('customer'|'property'|'invoice'), homeworks_id, and customer_homeworks_id for property/invoice." },
      { status: 400 },
    );
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase admin client is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const result = await syncHomeworksEntity(supabase, body);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
