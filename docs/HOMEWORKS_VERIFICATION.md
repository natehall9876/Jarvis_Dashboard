# Homeworks Sync — End-to-End Verification Procedure

No step here requires pasting a secret anywhere outside Vercel's or
Zapier's own dashboards. Follow in order.

## 0. Prerequisite: rotate the webhook secret first

If you haven't already (see `JARVIS_PROGRESS.md`), do this before testing —
otherwise you're verifying a connection using a secret that may already be
compromised.

1. Generate a new secret yourself (a password manager, or run
   `openssl rand -hex 32` in a terminal — the output stays on your screen,
   never sent anywhere by that command itself).
2. Vercel → your project → Settings → Environment Variables →
   `HOMEWORKS_WEBHOOK_SECRET` → edit the value → confirm **Production** is
   checked → Save.
3. Zapier → open the Zap → the "Webhooks by Zapier" POST step → Headers →
   update `x-homeworks-webhook-secret` to the same new value → Save.
4. Vercel → Deployments → latest → **⋯** → **Redeploy** (environment
   variable changes need a fresh deployment to take effect).
5. Wait for the deployment to show **Ready**.

## 1. Confirm the new deployment is live (no secret needed)

In a terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://jarvis-dashboard-fawn.vercel.app/
```

Expect `307` (redirects to login — this just confirms the server responds).

## 2. Confirm the secret was actually updated (no secret needed)

```bash
curl -s -X POST https://jarvis-dashboard-fawn.vercel.app/api/integrations/homeworks/webhook \
  -H "content-type: application/json" \
  -H "x-homeworks-webhook-secret: obviously-wrong-value" \
  -d '{"entity_type":"customer","homeworks_id":"probe"}'
```

Expect: `{"error":"Invalid or missing webhook secret."}`. This proves a
secret is configured and being checked, without revealing what it is. (If
you instead see `"not configured"`, the env var didn't save or the
redeploy hasn't finished — go back to step 0.)

## 3. Run the real Zapier test (uses your real secret, stays inside Zapier)

In the Zap editor, on the "Webhooks by Zapier" step, click **Test step**.
Zapier will show you the actual response inline. Look for:

```json
{ "ok": true, "entity_type": "customer", "id": "<some uuid>" }
```

- `"ok": true` + a `id` → the write succeeded.
- Anything else (an `"error"` field) → copy *only the error message text*
  (never the request/headers) and share that — it will name the exact
  problem (e.g. a missing required field, or a real database error).

## 4. Confirm the record independently, two ways (no secret needed for either)

**A — In Supabase directly** (fastest, fully independent of the app):
Supabase dashboard → Table Editor → `clients` table → search/filter for
the value you sent as `homeworks_id` in step 3. If a row exists with that
`homeworks_id` and the customer's name in `first_name`/`last_name`, the
sync worked at the database level.

**B — In Jarvis itself:**
Log into https://jarvis-dashboard-fawn.vercel.app → Clients → search for
that same customer's name. It should appear in the list — this confirms
not just that the row exists, but that the rest of the app (RLS,
rendering) sees it correctly too.

## 5. Confirm idempotency (optional but recommended)

Click **Test step** in Zapier a second time for the *same* customer
record. Expect the *same* `id` back (not a new one), and check Supabase's
Table Editor again — still exactly one row for that customer, not two.
This confirms re-syncs update rather than duplicate.

## What "done" looks like

All of: step 2 shows the secret is live, step 3 returns `ok: true`, and
step 4 shows the record in both Supabase and Jarvis's Clients page. Only
then is it accurate to say the Homeworks integration is verified working
— not before.
