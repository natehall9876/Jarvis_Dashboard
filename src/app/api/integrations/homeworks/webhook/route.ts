import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { homeworksWebhookEnv } from "@/lib/env";
import { extractErrorMessage } from "@/lib/data/shared";

/**
 * Receives events from a Zapier "Webhooks by Zapier" action, triggered by
 * one of Homeworks' native Zapier triggers (New Customer, New Property,
 * New Invoice, New Payment, etc. — homeworks.com/product/integrations).
 * This is the officially supported Homeworks integration path; there is no
 * documented direct Homeworks API, so this project does not invent one.
 *
 * This endpoint defines its OWN expected JSON shape (below) — the exact
 * mapping from Homeworks' real fields into that shape happens inside
 * Zapier's own field-mapping UI when the Zap is built, so nothing here
 * guesses at Homeworks' internal field names.
 *
 * Expected body: { entity_type: "customer" | "property" | "invoice", homeworks_id: string, ...fields }
 *
 * Auth: a shared secret in the `x-homeworks-webhook-secret` header, checked
 * against HOMEWORKS_WEBHOOK_SECRET — there is no Supabase Auth session for
 * a server-to-server call like this to present, so this is the only gate.
 * On success, writes go through the service-role client (the one narrow,
 * documented exception to this project's no-service-role-key rule — see
 * lib/supabase/admin.ts) since RLS's `to authenticated` policy has no
 * session here to authorize against.
 */

type CustomerPayload = {
  entity_type: "customer";
  homeworks_id: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
};

type PropertyPayload = {
  entity_type: "property";
  homeworks_id: string;
  customer_homeworks_id: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  property_name?: string;
};

type InvoicePayload = {
  entity_type: "invoice";
  homeworks_id: string;
  customer_homeworks_id: string;
  invoice_number?: string;
  total?: number;
  amount_paid?: number;
  status?: string;
  due_date?: string;
  invoice_date?: string;
};

type WebhookPayload = CustomerPayload | PropertyPayload | InvoicePayload;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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

  if (typeof body !== "object" || body === null || !("entity_type" in body) || !("homeworks_id" in body)) {
    return NextResponse.json({ error: "Body must include entity_type and homeworks_id." }, { status: 400 });
  }
  const payload = body as WebhookPayload;
  if (!isNonEmptyString(payload.homeworks_id)) {
    return NextResponse.json({ error: "homeworks_id must be a non-empty string." }, { status: 400 });
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Supabase admin client is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  try {
    switch (payload.entity_type) {
      case "customer": {
        const { data, error } = await supabase
          .from("clients")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              first_name: payload.first_name ?? null,
              last_name: payload.last_name ?? null,
              company_name: payload.company_name ?? null,
              email: payload.email ?? null,
              phone: payload.phone ?? null,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, entity_type: "customer", id: data.id });
      }
      case "property": {
        if (!isNonEmptyString(payload.customer_homeworks_id)) {
          return NextResponse.json({ error: "property requires customer_homeworks_id." }, { status: 400 });
        }
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("homeworks_id", payload.customer_homeworks_id)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) {
          return NextResponse.json(
            { error: `No client found with homeworks_id "${payload.customer_homeworks_id}" — sync the customer first.` },
            { status: 409 },
          );
        }
        const { data, error } = await supabase
          .from("properties")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              client_id: client.id,
              street: payload.street ?? null,
              city: payload.city ?? null,
              state: payload.state ?? null,
              zip: payload.zip ?? null,
              property_name: payload.property_name ?? null,
              active: true,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, entity_type: "property", id: data.id });
      }
      case "invoice": {
        if (!isNonEmptyString(payload.customer_homeworks_id)) {
          return NextResponse.json({ error: "invoice requires customer_homeworks_id." }, { status: 400 });
        }
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("homeworks_id", payload.customer_homeworks_id)
          .maybeSingle();
        if (clientError) throw clientError;
        if (!client) {
          return NextResponse.json(
            { error: `No client found with homeworks_id "${payload.customer_homeworks_id}" — sync the customer first.` },
            { status: 409 },
          );
        }
        const total = typeof payload.total === "number" ? payload.total : 0;
        const { data, error } = await supabase
          .from("invoices")
          .upsert(
            {
              homeworks_id: payload.homeworks_id,
              client_id: client.id,
              invoice_number: payload.invoice_number ?? null,
              total,
              subtotal: total,
              tax: 0,
              amount_paid: typeof payload.amount_paid === "number" ? payload.amount_paid : 0,
              status: payload.status ?? "sent",
              due_date: payload.due_date ?? null,
              invoice_date: payload.invoice_date ?? null,
            },
            { onConflict: "homeworks_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, entity_type: "invoice", id: data.id });
      }
      default:
        return NextResponse.json({ error: `Unsupported entity_type "${(payload as { entity_type: string }).entity_type}".` }, { status: 400 });
    }
  } catch (err) {
    // Supabase/PostgREST errors are plain objects, not Error instances — a
    // naive `instanceof Error` check here previously swallowed the real
    // reason (e.g. a Postgres constraint error) behind a generic "Sync
    // failed." message. console.error keeps the real error in Vercel's
    // function logs even for cases where returning it in the response
    // would be too revealing; here it's safe to return directly since the
    // caller already proved it holds the shared secret.
    const message = extractErrorMessage(err);
    console.error("[homeworks-webhook]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
