# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-17, third session (evening sprint, owner active
throughout in a separate tab on the unrelated Squarespace site).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Latest verified commit:** `7df2049` — pushed and confirmed live:
probed the new dry-run endpoint on production directly and it reached the
new code path (401 on a wrong secret, not 404), proving the deployment
succeeded without relying on Vercel dashboard access.

## Facts reported by the owner this session (not independently observed by me)

- Homeworks webhook secret was rotated in both Vercel and Zapier, and the
  app was redeployed.
- A Zapier test-step run returned `ok:true` with a customer database id.
- A client named "Jarvis Integration Test" is visible on the live Clients
  page.
- **This confirms one manual test succeeded — it does not yet confirm the
  live "New Customer" Zap has fired automatically on its own**, and I have
  not queried Supabase directly to confirm the row (no database access).

## Third-session changes (on top of everything below, reconciled and reconfirmed accurate before touching anything)

- Re-ran typecheck/lint/build/e2e fresh at session start — all clean,
  matched what the prior write-up claimed.
- **Dry-run mode** added to the bulk import endpoint
  (`POST /api/integrations/homeworks/import` with `dry_run: true`): checks
  every record against the database and against customers appearing
  earlier in the same batch, reports would_create/would_update/would_fail
  counts, writes nothing. Built specifically so a real Homeworks export
  can be validated before a single row changes (per explicit instruction:
  "Never import a partially mapped file blindly").
- **Real bug fixed**: the Settings page's Homeworks card checked
  `HOMEWORKS_API_KEY` — a variable nothing in the app actually reads. The
  real integration uses `HOMEWORKS_WEBHOOK_SECRET` +
  `SUPABASE_SERVICE_ROLE_KEY`. Even with the webhook fully live, this page
  would have kept showing "Not Connected." Replaced with a live-verified
  check that counts actually-synced clients (`homeworks_id is not null`)
  — the Settings page will now show the true synced-customer count.
- Audited the codebase for fabricated/placeholder data patterns outside
  the explicitly-marked mock folder — found none; the app's existing
  "return null, not fake data" discipline held up under a fresh check.
- Webhook secret rotation: reported done by the owner (see above) — I
  have not independently re-verified the *new* secret is what's active
  (verifying that would require probing with the actual value, which
  correctly never appears here).

> Read this file first in any new session before assuming what is or isn't
> built — it reflects real, verified state, not intentions. If this file
> disagrees with a claim made earlier in a chat transcript, trust this file.

## Autonomous execution: what actually happened

This session had **no persistent background-execution capability** —
everything below was done in one continuous interactive turn, not overnight
unattended work. When that turn ends, execution stops until a new session
is opened. There is no cron/scheduled task configured for this project. If
a future session claims to have "kept working overnight," verify that
claim against this file and `git log` before trusting it.

## What genuinely works right now (verified, not assumed)

- **Auth**: login, password recovery (Supabase's *default* — no custom
  SMTP — recovery email, via `/reset-password` handling both the hash-
  fragment and `?code=` redirect shapes), session persistence.
- **Command Center, Schedule, Clients, Properties, Jobs, Routes, Quotes,
  Invoices, Employees, Equipment, Expenses, Reports, AI Advisor,
  Settings**: all render real Supabase data server-side; CRUD verified
  working in earlier sessions (see `docs/CURRENT_STATE.md` for the
  detailed, page-by-page verification log — still accurate).
- **AI Advisor**: real Anthropic tool-calling over live Supabase data,
  multi-turn context, page-context grounding, write-action proposals
  (reschedule/status/assign/create job) with confirm/cancel, durable
  idempotency (`action_requests` table, live). Visual polish applied
  (glowing command-bar input, animated loading state, restructured
  message cards) — **not** the full "Iron Man" redesign requested in
  Part 9; that's a much larger, multi-session design effort, not started.
- **PWA**: manifest, generated icons (emerald spark mark), viewport meta —
  live on production, confirmed via direct HTTP checks.
- **Weather**: coordinates corrected to Greenville, RI (41.8912, -71.5473)
  locally — **you must also set this in Vercel's env vars**, I cannot.

## Homeworks integration — the real, current status

**Architecture is built and deployed. End-to-end write has NOT been
independently verified by me** (I don't have the webhook secret, by
design — you tested it yourself and got `ok: true` once, before the bug
below was found and fixed).

- Real, documented integration path: Homeworks' own Zapier app (9
  triggers, 6 actions — confirmed via Zapier's own listing, not guessed).
  No direct Homeworks API is publicly documented.
- `POST /api/integrations/homeworks/webhook` — receives one record per
  Zapier-triggered event (customer/property/invoice), upserts by
  `homeworks_id`. Auth: `x-homeworks-webhook-secret` header against
  `HOMEWORKS_WEBHOOK_SECRET`. Writes via the service-role client
  (`lib/supabase/admin.ts` — the one deliberate exception to "no
  service-role key" in this project, scoped to exactly this use).
- `POST /api/integrations/homeworks/import` — bulk backfill for
  Homeworks' *existing* customer base (the live trigger only fires for
  customers created going forward). Accepts `{records: [...]}`, up to
  500/request, same shape as the webhook, per-record success/failure
  reporting. **Not yet used with real data.**
- **Two real bugs found and fixed this session** (found by reading code
  and by you actually testing it, not by guessing):
  1. Error handling swallowed real Postgres errors behind a generic
     "Sync failed." — fixed by reusing `extractErrorMessage` (already
     existed in `lib/data/shared.ts` for the same bug class).
  2. The original migration made `homeworks_id` unique via a *partial*
     index, which Postgres's `ON CONFLICT` (what `.upsert()` generates)
     cannot target. Fixed with `supabase/homeworks-integration-fix-
     constraint.sql` (replaces the partial index with a real unique
     constraint — verified Postgres has no `ADD CONSTRAINT IF NOT
     EXISTS`, used the documented `DO`/`duplicate_object` idiom instead).

### Security: webhook secret rotation — INCOMPLETE, needs your action

You reported the webhook secret was exposed in a screenshot. I cannot
rotate it myself — I have no Vercel or Zapier dashboard/API access. What
I verified: no secret is committed anywhere in git history or the current
tree (checked directly). What still needs to happen, by you:

1. Generate a new random secret (any password generator, or run
   `openssl rand -hex 32` yourself — don't paste the output anywhere
   public).
2. Vercel → Settings → Environment Variables → update
   `HOMEWORKS_WEBHOOK_SECRET` to the new value → **Production** scope
   checked → Save.
3. Zapier → the "Webhooks by Zapier" POST step → Headers →
   `x-homeworks-webhook-secret` → update to the same new value.
4. Redeploy (Vercel dashboard, or I can trigger it with an empty commit
   if you tell me to in a future session).
5. Test: re-run the Zap's test step. A response with `"ok":true` and a
   database `id` confirms the new secret works. I can independently
   confirm the *old* secret is rejected by probing with it (I'd need you
   to tell me what it *was*, or just trust that changing the env var
   value alone invalidates it — Vercel doesn't keep old values active).

## Task status (as of this checkpoint)

**Completed & verified:**
- Homeworks dry-run import mode (auth gate + validation confirmed locally
  and on production).
- Settings page Homeworks status now checks the real credentials and
  verifies with a live query.
- typecheck/lint/build/e2e (26/26) clean; production deployment confirmed
  live by direct probe.

**Completed, unverified (needs your eyes or a real export):**
- Whether the rotated webhook secret is truly the *new* one (structurally
  confirmed *a* secret is enforced; can't confirm which).
- Whether an automatic (non-manual) Zap run has ever fired.

**Blocked on you:**
- Identifying which `clients` rows are test/placeholder vs. real (I have
  no database access — see the request at the top of this session).
- A real Homeworks customer export, to run through the new dry-run mode.
- QuickBooks / Google Calendar OAuth app registration (your accounts).

**Not started (see below for full honesty on scope):**

## Not started (honest, not deferred-and-implied-done)

- **QuickBooks Online**: no OAuth scaffolding built. First real step:
  register an app at Intuit Developer, get a Client ID/Secret.
- **Google Calendar**: no OAuth scaffolding built. First real step:
  Google Cloud project, enable Calendar API, create OAuth credentials.
- **Marketing Studio** (Part 10): not started at all.
- **Route/weather intelligence beyond the existing weather card**: not
  started.
- **Full "Iron Man" visual redesign** (Part 9): only incremental polish
  done on the AI Advisor; Command Center and other pages still use the
  existing design system, not a ground-up reimagining.
- **Employee-facing views / permissions**: not started (owner-only auth
  model unchanged).

## Tests

- `npm run typecheck`, `npm run lint`, `npm run build`: clean as of
  commit `c64ec00` (re-verified fresh, not carried over from an earlier
  write-up).
- `npx playwright test`: **24/24 passing** (chromium + mobile-safari),
  covering unauthenticated routing, the write-action security boundary,
  and both new Homeworks endpoints' auth/validation gates.
- CI (`.github/workflows/ci.yml`) runs the same checks on push.
- **Not tested**: an actual successful Homeworks → Supabase write (needs
  your real secret, which correctly never appears in any chat or log).

## How this was verified (so "deployed" isn't just asserted)

Every "live"/"confirmed" claim above was checked with a direct HTTPS
request to the production URL from this environment (e.g. probing the
webhook with a deliberately wrong secret and confirming the error message
changes from "not configured" to "invalid secret" proves the env var
exists, without ever knowing its value) — not inferred from a successful
`git push`.

## Exact next action for you

1. Rotate the Homeworks webhook secret (steps above) — treat as
   compromised until done.
2. Get a Homeworks customer export (check Settings/Reports inside
   Homeworks itself — I have no way to verify what's available there)
   and hand it to a future session to load via the new `/import`
   endpoint.
3. Decide whether QuickBooks or Google Calendar matters more for near-
   term use — that decides what I build the OAuth scaffolding for next.
