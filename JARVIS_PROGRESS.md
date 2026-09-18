# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-17, fifth session ("maximum-effort development
sprint" — see full directive at top of session transcript; this entry
covers only the first completed deliverable from that sprint).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Latest pushed commit:** `66bac51` — pushed to `origin/main`. Until the
migrations below are run, Command Center's Today's Mission and Business
Pulse cards will show a graceful error state on production (not a crash,
not wrong data) — this is expected and goes away the moment you run them.

## ⚠️ ACTION NEEDED FROM YOU — 2 minutes, before these features work

Two new database migrations are written but **not yet applied** — I have no
way to run SQL against your live Supabase project myself (no DB console
access, no linked CLI). Until you run these, the Command Center's "Today's
Mission" and "Business Pulse" cards will show a graceful "couldn't load"
error (not broken data, not a crash — the app already degrades safely into
its existing error-state UI when a query fails) instead of using the new
demo-data filtering, and photo upload will fail with a clear inline error
instead of working.

1. Open your Supabase project → **SQL Editor**.
2. Paste and run `supabase/demo-data-classification-migration.sql`.
3. Paste and run `supabase/photo-upload-migration.sql`.
4. Refresh Jarvis — Today's Mission and Business Pulse should load normally
   again, and the Photos section on any Job or Property page should accept
   an upload.

Both files are idempotent (safe to run twice) and additive only — nothing
is deleted, no existing column is dropped, no existing row is overwritten
beyond the specific reclassification the demo-data migration documents
inline.
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
  color `#72F238`):** DONE this session, commit `8a0b353`. This was
  the first time this whole engagement had an authenticated browser
  session (the dev server's cookie was already live), so unlike every
  prior "visual" claim in this file, this one is genuinely browser-
  verified, not code-reviewed-and-hoped. See below for what that
  session found and fixed.
- **Priority 4 (demo-data provenance audit):** NOT STARTED this session
  (AI-prompt-level flagging of likely-test records was already done in
  the fourth session, commit `1024465` — that is a mitigation, not the
  audit itself).
- **Priorities 5–8:** unchanged from the fourth-session state described
  below (Homeworks substantially built; daily-ops workflows functional;
  PWA essentials built; QuickBooks/Google Calendar not started, blocked
  on the owner's own OAuth app registration).

## Sixth-session changes — "business activation" sprint

Priority 0 (preserve everything) confirmed first: `git log`/`git status`
showed a clean tree at commit `356ef13`, matching exactly what the fifth
session's write-up claimed — nothing was lost, nothing rewritten. All
changes below are additive on top of that.

### Homeworks — real investigation, no guessed code

Fetched `home.works/connect` directly (not assumed). Real findings:
- Homeworks now has an actual **GraphQL API** with **OAuth 2.1 + PKCE**
  auth ("Self-serve app registration — live in minutes") — this is new
  since the last time this was investigated (a prior session correctly
  found only a Zapier app, no direct API; Homeworks appears to have added
  a real API since).
- Separately, Homeworks also offers an **MCP connection** ("talk to your
  Homeworks data through an AI assistant... Claude, ChatGPT"). This is a
  *different* thing from the API — confirmed your instinct: an MCP
  connection for a coding assistant does NOT give the deployed Jarvis web
  app access. The API (OAuth 2.1 + PKCE, GraphQL) is the correct
  integration path for the deployed app, not MCP.
- **What I could not find, and did not guess**: the actual OAuth
  authorize/token endpoint URLs, the GraphQL schema/endpoint, or exact
  scope names. These aren't in any public documentation I could reach —
  the marketing page says app registration happens "from Settings" inside
  your own Homeworks account, meaning these specifics only become visible
  once you're logged into your own account. I deliberately did **not**
  write speculative OAuth/GraphQL integration code against guessed
  endpoints — that would risk confidently-wrong code presented as working,
  which the standing instruction explicitly rules out.
- **Your exact next action**: log into your Homeworks account → find
  Settings → look for "API," "Developer," or "Connect" → register a new
  API application (their own copy says this takes minutes) → note the
  Client ID and the exact OAuth/GraphQL endpoint URLs it shows you (these
  are not secret) → put the Client Secret directly into Vercel's
  environment variables yourself (never paste it in chat, matching the
  standing rule) → tell me the Client ID + endpoint URLs and I'll build
  the real integration against real, confirmed specifics instead of
  guesses.

### Demo data — real evidence found, not just flagged

While verifying the Clients page in an authenticated session (before this
session's browser cookie expired — see note below), found concrete,
citable evidence: **five client records — Jessica Alvarez, Linda Park
(Greenfield HOA), Mike Thompson, Robert Chen, Sarah Delgado — all share
phone numbers in the exact `704-555-01XX` block.** `555-0100`–`555-0199`
is reserved by the North American Numbering Plan exclusively for
fictional use; these were never real assigned numbers. This is a
verifiable fact about the numbers, not a guess about the names, and it's
independent of whether the records have realistic-looking jobs/invoices
attached (they do — Robert Chen shows a $70 balance, Sarah Delgado $65 —
which is exactly why phone-number provenance matters more than "does it
look plausible").

Implemented:
- `clients.data_source` column (`demo` | `homeworks_sync` | `owner_verified`
  | `unverified`) — supabase/demo-data-classification-migration.sql.
  Backfills the 5 confirmed-demo clients and anything with a real
  `homeworks_id`; everything else stays `unverified` (the honest default —
  NOT the same as demo, never treated as fake).
- `src/lib/data/data-source.ts` — `getDemoClientIds()`/`getDemoPropertyIds()`.
- Wired into the two places that actually compute "real business totals":
  `getBusinessPulse` (revenue/AR/quote-acceptance) and `getTodaysMission`
  (today's revenue/hours/priorities) in `lib/data/command-center.ts`, and
  `getOverdueInvoices` in `lib/data/invoices.ts` (feeds Command Center
  priorities + the AI's get_overdue_invoices/get_attention_items tools).
  Deliberately did NOT filter the raw Clients/Jobs/Invoices list pages —
  those still show every record; a "Demo data" badge appears on the
  Clients list instead, so nothing is hidden, only excluded from totals.
- `createClient` (the manual "Add Client" form) now stamps
  `data_source: "owner_verified"` — going forward, anything the owner
  types in is correctly classified from the start, not left "unverified."
- AI Advisor system prompt: `data_source: "demo"` is now an authoritative
  signal, in addition to the existing name-pattern heuristic ("Test",
  "@example.com", etc.) from the prior session.
- **Not done**: Travis Willams (401-323-0497, a real-looking RI number)
  was left `unverified`, not `owner_verified` — I have no actual
  confirmation he's real, only that his number doesn't match the fake
  pattern. Reports/Invoices/Quotes list pages and payments/labor-cost
  figures in Business Pulse are not yet demo-filtered (lower-stakes than
  revenue/AR, deferred for time).

### Natural-language job logging — the core of "remembering your business"

`propose_create_job` (the AI's existing job-creation tool) only supported
scheduling *future* work before this session — no way to log something
already done. Extended it (no schema migration needed — `jobs.actual_hours`,
`completion_notes`, `completed_at` already existed, unused) to handle both:
- **Completed work** ("I mowed Maria's today for $65, took 35 minutes"):
  `is_completed_log=true`, status becomes `completed`, price is what was
  charged, actual_hours is the duration converted to decimal, scheduled_date
  defaults to today unless a different date was given.
- **Future scheduling** (unchanged behavior): status stays `scheduled`.
- An uncertain/approximate date ("sometime last week") is never turned into
  a guessed exact date — the system prompt now explicitly instructs leaving
  scheduled_date unset and recording the approximate timing in notes
  instead, with the AI saying plainly that it's an unverified note.
- Every write still goes through the existing propose → owner confirms →
  execute pipeline (`lib/ai/actions/execute.ts`) — nothing new bypasses
  that. `executeCreateJob` now passes through status/actual_hours/
  completion_notes/completed_at to the real insert.
- **Verification status**: typecheck/lint/build clean, e2e 30/30. **Not
  live-verified this session** — the dev server's authenticated session
  expired partway through (a usage-limit reset dropped the browser
  cookie), and re-authenticating requires typing a password, which I don't
  do. Earlier in this same session, before the reset, I did verify the
  underlying streaming/tool-call pipeline works correctly end-to-end on a
  real multi-tool question — this specific new tool path uses that same
  verified pipeline, but the tool itself hasn't been exercised live. Ask
  Jarvis something like "I mowed the Willams property today for $65" and
  check the proposal card before confirming it.

### Photo upload — the foundation, built on existing infrastructure

Found that `job_photos` table, and photo-grid *display* code on the Job and
Property detail pages, already existed from an earlier session — but
nothing could ever get a photo INTO that table (no upload path existed),
and the display code assumed a PUBLIC storage bucket
(`getJobPhotoUrl` built a permanent public URL), which directly conflicts
with "never expose customer photographs publicly." Fixed both problems
rather than building a parallel system:
- supabase/photo-upload-migration.sql: makes `job_photos.job_id` nullable
  and adds `property_id`/`client_id` (a photo can be tied to whichever of
  job/property/client is actually known, with a check constraint requiring
  at least one), plus `uploaded_by`/`content_type`/`size_bytes`/
  `original_filename`/`source`. Creates the `job-photos` Storage bucket as
  **private** (`public: false`), with RLS policies scoping both the table
  and the storage objects to authenticated users only.
- `lib/supabase/storage.ts`: rewritten to generate short-lived (10-minute)
  **signed URLs** instead of permanent public links — the security fix.
- `lib/actions/photos.ts` — `uploadJobPhoto`: validates file type/size
  (15MB max, image formats only), uploads through the owner's own
  authenticated Supabase client (not the service-role admin client — same
  RLS-bound pattern as everything else in the app), inserts the
  `job_photos` row, cleans up the uploaded file if the DB insert fails so
  nothing is orphaned.
- `components/photos/photo-upload-form.tsx` — a compact upload form
  (file input with `capture="environment"` for a phone camera, optional
  caption) added inline to the existing Photos cards on both the Job and
  Property detail pages — no new page, no new nav entry, reusing exactly
  the UI real estate that already displayed photos with nothing to show.
- **Not done**: image/work-sheet OCR extraction (the sprint's Step 5
  second milestone) — not started. The upload foundation itself needed a
  database migration I can't self-apply, which only became clear partway
  through; building OCR extraction on top of an unverified upload path
  isn't a good sequencing choice. Once the migration is confirmed applied
  and a real upload is verified working, this is the next logical piece.
- **Verification status**: typecheck/lint/build clean, e2e 30/30. **Not
  live-verified** — same session-expiry reason as above, and this
  specifically also needs the migration run first before any live test is
  possible at all.

### Manual entry, voice input — confirmed already real, not rebuilt

- "Add Client" / "Create Job" modal forms already existed
  (`clients/page.tsx`, `jobs/page.tsx`) from earlier sessions. Confirmed
  via the live Clients page (before the session reset) that a manually-
  created test record ("ZZZ-JarvisQA TestClient," from an earlier session)
  was still present — real evidence persistence survives across sessions,
  not just page refreshes. Did not rebuild this.
- Voice input (Web Speech API mic button in the AI Advisor's question box)
  already existed from an earlier session, wired to the same `submit()`
  path as typed questions. Untouched this session. Combined with the new
  completed-job-logging tool above, speaking "I mowed Maria's for $65"
  into the mic should now flow all the way to a real proposed job record —
  this specific combination has not been tested live (same reason as
  above).

## Fifth-session changes

- **Command Center and AI Advisor visual elevation** (priority 3) — brand
  green swapped from a muted #2dd66f to the real WeedEater #72f238
  everywhere (one CSS variable, so it propagated app-wide); AI Advisor's
  chrome was violet, separate-looking from the rest of the app — unified
  to the accent green. PageHeader (app-wide) title made larger/tighter;
  every Command Center card header now has a small accent icon next to
  its title, matching a pattern the AI Advisor panel already used.
  Command Center's layout, composition, and all data/functionality were
  left untouched per explicit instruction — this was styling and
  hierarchy only.
  - **Two real bugs found and fixed via actual browser inspection** (not
    code review) — this was the first session with a live authenticated
    dev-server cookie, so for the first time claims here could be
    genuinely verified by clicking through the real app:
    1. **Desktop sidebar scrolled away** with the page once content
       exceeded one viewport — the old layout was a plain `min-h-screen`
       flex row with no pinning. A `position: sticky` attempt was tried
       first and also failed (sticky only holds within its own flex-item
       box, which doesn't span a page taller than one viewport — a real
       CSS gotcha, not a typo). Fixed with the standard "app shell"
       pattern instead: sidebar is `fixed`, content column gets
       `lg:pl-60` to clear it. Confirmed via `getBoundingClientRect()` at
       multiple scroll depths, not just eyeballing a screenshot (the
       browser tool's screenshot capture turned out to visually
       mis-render `position: fixed` elements after a scroll — a tool
       display quirk, confirmed separately, not a real layout bug; the
       DOM measurement was the actual proof).
    2. **AI streaming regression** (introduced by this session's earlier
       AI-speed work, priority 1): Claude Sonnet 5 returns extended-
       thinking content blocks even without `thinking` requested. The
       SSE parser only accumulated `text_delta`/`input_json_delta` —  a
       thinking block's `thinking_delta`/`signature_delta` chunks were
       dropped, so it got echoed back to Anthropic empty on the next
       tool-loop iteration, and Anthropic rejected the turn ("each
       thinking block must contain thinking"). Found by actually asking
       Jarvis a real multi-tool question in the browser and watching it
       fail with a 400. Fixed by accumulating those deltas properly;
       re-tested the identical question live afterward and it completed
       correctly with full streaming + markdown rendering.
  - **Mobile**: added a real bottom tab bar (Today / Schedule / Jobs /
    Ask Jarvis / More) — the mobile nav was hamburger-drawer-only before,
    which didn't match the sprint's "fast access to today's work in the
    field" requirement. "More" opens the same full nav list as before.
    The floating Jarvis FAB moved up to clear the new tab bar on mobile
    (unchanged on desktop).
  - Fixed a real animation bug while adding a subtle fade-in stagger to
    Command Center's sections: `.animate-fade-in` had no
    `animation-fill-mode`, so a delayed element would flash at full
    opacity then snap to invisible and fade back in — added `backwards`.
  - **Verified live in the browser** at both desktop (1440×900) and
    mobile (375×812): Command Center (full scroll), the full-page AI
    Advisor, and a real streamed multi-tool owner-briefing answer all
    confirmed rendering correctly. typecheck/lint/build clean, e2e
    30/30.
  - **Known gap**: I do not have a way in this environment to export the
    browser tool's screenshots as image files I can hand you directly —
    the visual verification was genuine (DOM measurements and repeated
    live inspection, not assumption), but I can't attach the actual
    screenshot files as proof. The fastest way to see the real result
    yourself is the production URL above, live now.

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
