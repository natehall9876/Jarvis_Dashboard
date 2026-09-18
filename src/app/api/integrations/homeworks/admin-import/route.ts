import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dryRunHomeworksEntity, isValidHomeworksSyncPayload, syncHomeworksEntity, type HomeworksSyncPayload } from "@/lib/integrations/homeworks-sync";

/**
 * The owner-facing counterpart to /api/integrations/homeworks/import.
 * Same shared sync/dry-run logic (lib/integrations/homeworks-sync.ts), but
 * authenticated by the owner's own logged-in session — via the normal
 * RLS-scoped client, exactly like every other write in this app — instead
 * of the Zapier webhook's shared secret + service-role client. There is no
 * reason the human operating their own already-authenticated dashboard
 * should ever need to know or type the machine-to-machine webhook secret;
 * this route exists so they don't have to.
 *
 * Body: { records: HomeworksSyncPayload[], dry_run?: boolean } — identical
 * shape to the webhook's bulk import, capped at the same 500/request.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to import Homeworks records." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("records" in body) || !Array.isArray((body as { records: unknown }).records)) {
    return NextResponse.json({ error: "Body must be { records: [...] }." }, { status: 400 });
  }
  const records = (body as { records: unknown[] }).records;
  if (records.length === 0) {
    return NextResponse.json({ error: "records array is empty." }, { status: 400 });
  }
  if (records.length > 500) {
    return NextResponse.json({ error: "Max 500 records per request — split larger exports into batches." }, { status: 400 });
  }

  const invalid = records.filter((r) => !isValidHomeworksSyncPayload(r));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} of ${records.length} records are missing required fields (entity_type, homeworks_id, and customer_homeworks_id for property/invoice).` },
      { status: 400 },
    );
  }
  const validRecords = records as HomeworksSyncPayload[];

  const dryRun = (body as { dry_run?: unknown }).dry_run === true;

  if (dryRun) {
    const customersSeen = new Set<string>();
    const preview = [];
    for (const record of validRecords) {
      preview.push(await dryRunHomeworksEntity(supabase, record, customersSeen));
      if (record.entity_type === "customer") customersSeen.add(record.homeworks_id);
    }
    return NextResponse.json({
      ok: true,
      dry_run: true,
      total: preview.length,
      would_create: preview.filter((p) => p.action === "create").length,
      would_update: preview.filter((p) => p.action === "update").length,
      would_fail: preview.filter((p) => p.action === "would_fail").length,
      preview,
    });
  }

  const results: Array<{ homeworks_id: string; entity_type: string } & ({ ok: true; id: string } | { ok: false; error: string })> = [];
  for (const record of validRecords) {
    const result = await syncHomeworksEntity(supabase, record);
    results.push(
      result.ok
        ? { homeworks_id: record.homeworks_id, entity_type: record.entity_type, ok: true, id: result.id }
        : { homeworks_id: record.homeworks_id, entity_type: record.entity_type, ok: false, error: result.error },
    );
  }
  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, total: results.length, succeeded, failed: results.length - succeeded, results });
}
