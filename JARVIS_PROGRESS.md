# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-17, end of an unattended overnight session.
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Latest verified commit:** `926300f` — pushed, deployed, confirmed live (see "How this was verified" below).

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
  commit `926300f`.
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
