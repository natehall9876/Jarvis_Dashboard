# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-17, fifth session ("maximum-effort development
sprint" — see full directive at top of session transcript; this entry
covers only the first completed deliverable from that sprint).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Latest pushed commit:** `a0c9e4f` — pushed to `origin/main`.
Production liveness re-probed directly after the push (root `307`
redirect-to-login, `/login` `200` — both as expected). **Important
honesty note:** this app exposes no build-time commit SHA anywhere in
its responses, so — unlike earlier sessions' webhook-secret probes,
which could distinguish *configured* from *misconfigured* by response
content — a plain HTTP probe cannot prove *this exact commit* is what's
serving traffic, only that *some* healthy deployment is. Vercel is
assumed to auto-deploy on push to `main` (true every prior session), but
that assumption is not independently re-verified here.

## Fifth-session sprint: status against the owner's stated priority order

The owner's sprint directive listed 8 priorities. This session so far
completed **priority 2 only** (professional AI answer rendering),
chosen ahead of priority 1 (AI response speed) because it was concrete,
buildable, and — critically — actually verifiable given this
environment's constraints (see below), where AI latency is not.
Priority 1 is the immediate next task, flagged honestly rather than
silently reordered.

- **Priority 1 (AI response speed):** DONE this session, commit
  `a0c9e4f`. Correction to the note originally written here: this
  environment turned out to have a real, working `AI_PROVIDER_API_KEY`
  in local `.env.local` (left over from earlier sessions), so this
  wasn't purely structural — I got genuine measured numbers, not just
  code review. See below.
- **Priority 2 (professional AI answer rendering):** DONE this session,
  commit `aca498f`. See below.
- **Priority 3 (Command Center / shared UI visual elevation, brand
  color `#72F238`):** NOT STARTED this session.
- **Priority 4 (demo-data provenance audit):** NOT STARTED this session
  (AI-prompt-level flagging of likely-test records was already done in
  the fourth session, commit `1024465` — that is a mitigation, not the
  audit itself).
- **Priorities 5–8:** unchanged from the fourth-session state described
  below (Homeworks substantially built; daily-ops workflows functional;
  PWA essentials built; QuickBooks/Google Calendar not started, blocked
  on the owner's own OAuth app registration).

## Fifth-session changes

- **AI Advisor now streams real answers end-to-end and uses prompt
  caching** — this was the sprint's explicit #1 complaint ("too slow,
  looks unprofessional"). The old path had zero streaming anywhere:
  `AnthropicProvider.complete()` awaited one fully-buffered JSON
  response from Anthropic; the tool-calling loop could repeat that up
  to 6 times sequentially with nothing visible in between; and
  `/api/ai-advisor` awaited the entire loop before sending one JSON
  blob to the browser. The owner watched a static spinner for the
  whole multi-second round trip.
  - `AIProvider.stream()` (replacing `complete()`) parses Anthropic's
    SSE stream directly over raw fetch (still no SDK dependency),
    yielding text as it's generated and a final structured result once
    the turn closes.
  - The system prompt is now sent as an Anthropic-cached block
    (`cache_control: {type: "ephemeral"}`), which caches everything
    before it in the request too — the ~43-tool schema array, the
    single largest and most static part of every call in a loop that
    can hit the API up to 6 times for one question.
  - `/api/ai-advisor` now returns `text/event-stream`
    (delta/done/error frames) instead of one buffered JSON body. The
    401 auth gate for an unauthenticated caller is unchanged — it
    still runs before the stream opens, so it costs nothing extra.
  - The AI Advisor UI grows the answer bubble in real time as text
    streams in, with a small streaming cursor; the "checking the
    numbers" bounce indicator now only shows before the first token
    arrives (i.e., while tools are being called) — once real text
    starts rendering, that growing text **is** the loading state, per
    the explicit instruction not to fake a typing effect that hides
    real delay.
  - **Real measurements**, not estimates: this environment turned out
    to have a working `AI_PROVIDER_API_KEY` in local `.env.local`
    (left over from earlier sessions), so I could hit the live
    Anthropic API directly. I wrote a temporary debug route that
    called the actual shipped provider/advisor code (not a
    reimplementation) with no Supabase session involved, confirmed
    `git status` was clean before adding it, and deleted it — confirmed
    absent from `git status` — before this commit.
    - Full production request shape (real system prompt + all 43 tool
      schemas), a question the model can answer without a tool call:
      **time-to-first-token 1281ms cold, 1004ms on an immediate repeat
      call (~22% faster)** — consistent with the new cache hitting.
    - The same reply arrived in 5–7 streamed chunks instead of one
      blob — the owner sees text forming instead of a spinner for the
      full ~1.3s.
    - **Not measured**: a real multi-tool-call question (e.g. an owner
      briefing), which is exactly where the caching win compounds most
      (up to 6 iterations resending the same system+tools prefix) —
      exercising a real tool needs a logged-in session, which this
      environment still doesn't have. The owner asking a real briefing
      question and watching whether it visibly streams is the
      remaining real-world check.
  - **Deliberately not done**: routing simple questions to a
    cheaper/faster model (the sprint directive's other latency
    suggestion). A classifier step adds its own latency, and
    misrouting a real business question to a weaker model risks wrong
    numbers — not worth that accuracy risk for a secondary win once
    streaming + caching already address the actual complaint.
  - typecheck/lint/build clean; e2e **30/30** (the ai-advisor
    unauthenticated-401 test still passes unchanged — that gate runs
    before the stream opens, so the response shape change doesn't
    touch it).

- **AI Advisor answers now render as real formatted markdown**, not raw
  text with literal `**`/`|`/`#` characters. Added `react-markdown` +
  `remark-gfm`; built `src/components/ai-advisor/markdown-message.tsx`
  (a full component map — bold, italics, headings, ordered/unordered
  lists, links, inline code, blockquotes, horizontal rules, and real
  bordered GFM tables — styled to the app's existing CSS custom
  properties, no new Tailwind config surface); wired it into
  `src/components/ai-advisor/ask-advisor.tsx` in place of the old
  `whitespace-pre-wrap` paragraph.
  - **How this was genuinely visually verified**, given no authenticated
    session exists in this environment: confirmed `git status` was
    clean on `src/app/(auth)/reset-password/page.tsx` (a public,
    unauthenticated page), temporarily added a realistic sample
    `MarkdownMessage` render to it (bold text, a note about excluding a
    test record, a 3-row GFM table, a bullet list, an "h3 → My take"
    heading) reachable at `/reset-password?code=fake-visual-check` on
    the local dev server, screenshotted it, confirmed correct rendering
    — real bordered table with header row, bold text bold, bulleted
    list, small uppercase muted-gray "MY TAKE" label, all matching the
    dark theme — then reverted the file with
    `git checkout -- "src/app/(auth)/reset-password/page.tsx"` and
    confirmed via a second read that the file exactly matched its
    original committed content before this commit was made. This
    pattern (safe temporary render on an already-public page,
    screenshot, git-revert, confirm clean) is new this session and
    reusable for future UI work that needs real visual proof but has no
    login access.
  - typecheck, lint, build, and `npx playwright test` (**30/30
    passing**, chromium + mobile-safari) all re-run clean on this exact
    change set immediately before committing.
  - **Not yet verified**: how this renders inside the actual live AI
    Advisor drawer against a real model response — that requires an
    authenticated session, which this environment does not have. The
    component itself is proven correct in isolation; its integration
    point (`ask-advisor.tsx`) is a two-line, low-risk swap, but the
    owner should open the AI Advisor and ask a real question (e.g. one
    that returns a table, like a revenue breakdown) to confirm end to
    end.

## Facts reported by the owner in the fourth session (not independently observed by me)

- Homeworks webhook secret was rotated in both Vercel and Zapier, and the
  app was redeployed.
- A Zapier test-step run returned `ok:true` with a customer database id.
- A client named "Jarvis Integration Test" is visible on the live Clients
  page.
- The owner personally tested the new Homeworks Import Review UI in their
  browser: pasted a sample record, clicked Preview, saw "1 would create /
  0 would update" with the record shown correctly in the preview table —
  **this is a genuine independent confirmation the UI renders and works
  correctly**, the first live-browser verification of anything built this
  week that I couldn't do myself. Did not click Confirm (correctly didn't
  want a test record written to production).
- **Still not independently confirmed by me:** whether the live "New
  Customer" Zap has ever fired automatically (only a manual test-step run
  is confirmed), and whether the *rotated* secret specifically (vs. some
  secret) is what's active — I can prove *a* secret is enforced, never
  which one.

## Fourth-session changes

- **Investigated and explained** (not a bug): local dev vs. production
  Homeworks connection-status discrepancy. Local `.env.local` has no real
  `SUPABASE_SERVICE_ROLE_KEY` (never has, by design — I've never held that
  credential), so the Settings page correctly shows "Not Connected"
  locally regardless of the webhook secret, while production (both real
  secrets present) correctly shows "Connected" once a customer has
  synced. Confirmed this is the *only* place in the codebase that reports
  Homeworks status — nothing else to reconcile.
- **Owner-facing Homeworks Import Review UI** — Settings → "Open Import
  Tool": paste a JSON export → Preview (exact create/update/fail counts +
  per-record table, writes nothing) → Confirm only after review.
  Authenticated by the owner's own login, not the Zapier secret.
  **Owner-verified working in the browser** (see above).
- **Command Center: added "Upcoming Work"** — the Command Center
  previously only showed *today*; there was no forward visibility at all,
  which matters heading into fall cleanup season. Reuses
  `getWorkloadSummary` (already built/tested for the AI Advisor's
  workload tool) to show the next 7 days with job counts, crew, hours,
  and revenue, each linking to that day on Schedule.
- **AI Advisor**: added explicit guidance to flag likely test/placeholder
  records (like "Jarvis Integration Test," which now genuinely exists in
  production) instead of silently folding them into real revenue/client
  totals. Prompt-only change — can't be tested by automated tests (no
  real AI key in this environment); worth spot-checking with a real
  revenue/client-count question.

All of the above: typecheck/lint/build clean, e2e suite passing (30/30
by end of session), each commit's production deployment independently
re-verified by direct HTTPS probe before moving to the next task.

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
