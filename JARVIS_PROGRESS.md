# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-20, following the owner's real customer import
(25 customers) and report that the import created 25 records instead of
the previewed 23-create/2-duplicate, plus 0 jobs visible on Sunday 9/20
and unverified $0 client balances.
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Latest pushed commit:** `97857ef` — pushed to `origin/main`. Production
confirmed reachable (HTTP 200 on `/login`) after this push — I cannot
cryptographically confirm this exact commit is what's serving traffic (the
app exposes no build SHA), only that a healthy deployment exists; Vercel
has auto-deployed every push in this project reliably so far.

## Jarvis experience rebuild (2026-09-21): living network, persistent voice, capability map

Built (code-level verified: typecheck, lint, build, 188 Playwright tests; NOT yet
verified in an authenticated browser session, which this environment cannot open):
- `src/lib/jarvis/network-engine.ts` — canvas particle network (white + warm-gold
  points, luminous core, links that form/dissolve). Seven states driven by real
  events. Verified visually in an isolated harness; lifecycle tested (one loop,
  clean stop/destroy). `intelligence-network.tsx` pauses off-screen/hidden,
  honors reduced-motion, adapts density, falls back to a static gradient.
- `jarvis-provider.tsx` — ONE app-wide session mounted in the dashboard layout
  (survives client-side navigation): conversation, speech recognition, spoken
  replies (sentence-streamed), mute, barge-in, hands-free mode, retry, session
  storage persistence (no audio stored; stale Confirm cards never restored).
  Deterministic voice navigation ("open my schedule"); entity lookups navigate
  only when exactly one record matches. Writes still require an explicit tap on
  Confirm — a transcript is never a confirmation. `voice-dock.tsx` replaces the
  old drawer (which closed on navigation and lost history).
- Command Center: hero with the network + briefing built only from real job rows;
  honest capability map (`capabilities.ts`) — connected / partial / planned, with
  what is actually missing stated (no QuickBooks, no routing provider, no task store).
- Schedule: compact cards (service, customer, address, time or "Unscheduled time",
  price, budgeted hours or "No budgeted hours", crew or "Unassigned", stop order),
  daily/weekly summary, status filters.

Platform limits (not bugs): browsers/iOS suspend the mic and audio when the app is
backgrounded or the screen locks; speech recognition needs Chrome/Edge/Safari and
sends audio to the browser vendor's service; spoken replies begin only after a tap.

Still open: job enrichment (service title from Homeworks line items, budgeted hours),
sync status panel, photo intake UI, voice notes/reminders (no task store exists),
route optimization, QuickBooks.

## Root cause found (2026-09-21): Homeworks IDs are numbers, Jarvis stores text

Live Homeworks GraphQL returns `Customer.id`, `Property.id`, and `Event.id`
(`SafeInt!`) as JSON **numbers** (verified against the live API: e.g. Nick
Hall = `1994294`). The adapter's TS types said `string`, and Jarvis stores
`homeworks_id` as text (`"1994294"`, written by the Zapier webhook from its
customer-ID field). Every `===` / `Map` / `Set` comparison therefore never
matched. This one bug explains all of: the import preview's "possible
duplicate (phone)" for every customer, the linking preview's "already linked to
a different customer" for all 25, and every job showing "property not synced".
The stored IDs were correct all along — they equal the live canonical IDs.

Fix: IDs are normalized to strings at the adapter boundary
(`homeworks-normalize.ts`) and again inside `planLinks`. No stored ID was
changed. The linking preview also has a read-only "Identifier diagnostic" that
classifies every matched customer (same ID / verified legacy mapping / likely
wrong stored type / unresolved conflict) and never overwrites a conflicting
non-blank ID. Correction to the earlier entry below: removing the
`if (c.homeworks_id) continue` guard was still correct, but the "25 created"
import result was really 25 upserts onto existing rows (the number/string
mismatch made every row look new), not 25 new rows.

## This session: found the real import-duplicate bug, built jobs sync, balance/duplicate visibility

**Root cause of the 25-created/0-skipped import** (the owner's main
question): `confirmHomeworksImport()` had `if (c.homeworks_id) continue;`
in its duplicate-detection pre-scan, which exempted *any* existing client
carrying *any* homeworks_id — even a stale or mismatched one — from
phone/email duplicate matching. `previewHomeworksSync()` never had this
guard, which is exactly why preview correctly predicted 2 duplicates but
the real import skipped 0. Fixed by removing the guard so both paths use
identical logic. **This only prevents future duplicates — it does not
retroactively clean up whatever the bug already created** (most likely a
second "Jarvis Integration Test" row, since that's a name flagged earlier
as having a homeworks_id from prior webhook testing).

**Built to let you find and decide on any existing duplicates yourself**:
a read-only "Check for duplicate client records" panel now on the Clients
page (`src/components/clients/duplicate-audit-panel.tsx`, backed by
`findDuplicateClients()` in `src/lib/actions/client-duplicate-audit.ts`).
It groups all clients by normalized phone and email and shows any group
with 2+ members — name, data source, homeworks_id, created date. It makes
no changes on its own. Per your explicit instruction, no merge or delete
was implemented — that's a decision only you can make, with the evidence
this panel surfaces.

**Jobs sync — built, not yet run by you.** `supabase/homeworks-jobs-migration.sql`
is a **fourth pending migration** (adds `jobs.homeworks_id` unique
column, same idempotent pattern as the other three). Once run, the
Settings → Homeworks card has a new "Scheduled jobs (next 7 days)"
section: **Preview job sync (read-only)** shows would-create/would-update/
blocked-by-unsynced-property counts, then **Confirm import** (behind a
native `confirm()` naming exact counts) does the write, upserting on
`homeworks_id`. Start times are only ever set when Homeworks reports
`hasTime: true` — never invented for all-day events. No crew/employee
assignment is attempted (none exists in the source data). Confirmed via
live MCP query that the real 15 jobs fall on 9/21, 9/24, and 9/25, 2026 —
**zero on Sunday 9/20 is correct, not a sync failure**, matching your own
hypothesis.

**Balances**: clients synced from Homeworks with no synced invoices now
show "Not synced" instead of a misleading $0, via a new `balance_verified`
flag (`src/lib/data/clients.ts`, both Clients pages). Invoices are not yet
part of any Homeworks sync path, so every homeworks_sync client will show
"Not synced" until that's built — this is expected, not a bug.

**Verification actually run this session**: `npm run typecheck` (clean),
`npm run lint` (clean, after fixing one `react/no-unescaped-entities`),
`npm run build` (succeeded), `npx playwright test` (34/34 passed, chromium
+ mobile-safari). All were run against the real code, not assumed. Still
not verified: whether the import/jobs/balance code paths behave correctly
against your live, authenticated session — no Supabase service-role key or
authenticated browser session is available in this environment, same
structural limitation as every prior session.

**Four migrations now pending your action, in order:**
1. `supabase/homeworks-oauth-migration.sql` (if not already run)
2. `supabase/homeworks-oauth-security-fix.sql`
3. `supabase/demo-data-classification-migration.sql` / `supabase/photo-upload-migration.sql`
4. `supabase/homeworks-jobs-migration.sql` (**new this session**)

## Real Homeworks data confirmed to exist — via MCP, not yet via the Jarvis app

The owner connected a genuine Homeworks MCP server to this Claude session
(`api.home.works/mcp`, a separate OAuth grant from the Jarvis app's own
stored token). Using it directly — real, live queries, not samples —
confirmed:
- **Real account**: `natehall9876@gmail.com` at **WeedEater Lawn Care**
  (Homeworks company id 10154).
- **25 real customers** (complete list, not a sample — Nick Hall, Alicia
  Rathbun, Ron Gengron, Travis Willams, and 21 others, plus one visibly-
  test record, "Jarvis Integration Test," correctly identifiable as such).
- **15 real scheduled jobs** in the next 7 days (2026-09-20 through
  2026-09-27), all lawn-maintenance visits across real Smithfield/North
  Smithfield/Johnston/Burrillville, RI addresses. None have a crew
  assigned yet.

**This is not the same thing as the Jarvis application being connected.**
That MCP session is a separate credential, scoped to this Claude
conversation, with no relationship to the `homeworks_oauth_connection`
table the Jarvis app reads from. What it's genuinely useful for: every
GraphQL query the Jarvis app makes to Homeworks can now be empirically
tested against the real API before being written into application code,
instead of only cross-checked against the schema file. That testing
caught two real bugs this session (below) that schema-reading alone would
have missed — both are exactly the kind of "looks right, fails at
runtime" errors GraphQL's scalar/enum coercion produces, and neither
would have been visible without an actual authenticated call.

## Two real bugs found via live testing, fixed before they reached the app

1. `orderBy: [{ startDate: ASC }]` — Homeworks' API rejected this
   ("does not exist in SortOrder enum, did you mean asc or desc").
   Lowercase fixed it.
2. More subtly: the exact same query, sent as a *parameterized* query
   (`$from: LocalDate!`) instead of inline literals, failed differently
   — "$from of type LocalDate! used in position expecting type Date."
   `Event.startDate`'s own field type is `LocalDate`, but the filter
   input (`DateFilter.gte`/`lte`) expects the separate `Date` scalar.
   This is exactly the kind of app-only failure that can't be caught by
   testing an inline query — the Jarvis app always sends parameterized
   queries (never inline literals), so this specific bug would only have
   surfaced when the owner actually clicked Preview in production.
   Retested the corrected, parameterized shape and confirmed real
   results before writing it into `lib/integrations/homeworks-api.ts`.

Command Center's Today's Mission and Business Pulse cards will show a
graceful error state on production (not a crash, not wrong data) until
the migrations below are confirmed run — I still cannot verify migration
status directly (no DB access, see below).
them.

## Real RLS vulnerability found and fixed — homeworks_oauth_connection

The owner caught this directly, correctly, and it was real: the original
`homeworks-oauth-migration.sql` gave `homeworks_oauth_connection` this
project's normal `to authenticated using (true)` policy — the right
pattern for ordinary business tables (clients, jobs, invoices), wrong here
because this table holds live bearer tokens for an external system, a
materially worse exposure if read by the wrong party.

**Why this needed real investigation, not a quick patch**: Postgres RLS
structurally cannot distinguish "this app's own server code" from "an
authenticated owner's browser calling Supabase's REST API directly with
the same JWT" — both present as the identical `authenticated` role. So
`using (true)` let any authenticated session read raw tokens directly,
completely bypassing the "never import this in a client component"
discipline the code already followed, since RLS doesn't know or care
about that discipline.

The owner's own instinct — don't assume `connected_by = auth.uid()` is
safe to lean on — turned out to be exactly right: checked every caller of
`getValidAccessToken()` and confirmed it's reached from Server Actions
(verify/preview/import) any signed-in session can invoke, not necessarily
whichever session originally clicked Connect. Scoping by row ownership
would have silently broken the integration for anyone except the original
connector — a real, single shared business integration, not a per-user
resource.

**The fix**: RLS now denies `authenticated`/`anon` entirely on this one
table (no policy at all) — genuinely unreachable except via the
service-role client. `lib/integrations/homeworks-connection.ts` now uses
`createSupabaseAdminClient()`, and — because bypassing RLS means the
application code is now the *only* access control — every exported
function in that file independently calls `auth.getUser()` before
touching the table. This mattered concretely: none of the Server Actions
that reach this table (verify, preview, disconnect) had their own auth
check before this fix — they relied entirely on RLS silently denying
unauthenticated queries. Switching to the admin client without adding
these checks would have been a *worse* vulnerability than the one being
fixed (unauthenticated access to trigger Homeworks queries), so both
changes shipped together, verified by re-reading every call site, not
assumed. `lib/supabase/admin.ts`'s doc comment now documents this as the
second of exactly two deliberate, independently-justified RLS exceptions
in the project.

**Action needed**: this requires one more small migration —
`supabase/homeworks-oauth-security-fix.sql` — since the vulnerable table
already exists in production; editing the original migration file doesn't
retroactively fix an already-applied one. It only drops the old policy and
adds no replacement (no table/column/row is touched). Run it, then
reconnect Homeworks (the previous connection attempt during this
back-and-forth was never actually saved, so there's nothing stored to
lose).

## Overnight session — root-caused the missing Preview button, built the confirmation-gated import

**The actual bug, found and fixed**: `saveConnection()` (in
`lib/integrations/homeworks-connection.ts`) awaited a Supabase `.insert()`
but never checked its `error`. If that insert failed for any reason — most
likely the `homeworks-oauth-migration.sql` migration never having actually
been run, so the table doesn't exist — the OAuth callback still redirected
to Settings claiming success (`?homeworks=connected`), which is exactly
the one-time "Connected — click Verify..." message you saw. The very next
page load correctly found no stored row and reverted to showing "Connect
Homeworks" instead of the Preview/Verify buttons — this is why the button
"disappeared": it was never truly there to begin with, because the
connection was never actually persisted. Not a deployment issue, not
caching, not a hidden conditional — traced to one specific unchecked error.

Fixed: `saveConnection` now returns `{ok, message}` and the callback route
checks it, so a failed save now shows a real, visible error instead of a
false success. `getConnectionStatus()` also now distinguishes "genuinely
never connected" from "a real read error" instead of collapsing both into
the same UI state — the Settings card will now show the exact error (e.g.
"relation does not exist") if the migration still hasn't been run, rather
than silently looking like nothing happened.

**Built while you slept, all read-only or explicitly confirmation-gated:**
- `getAllCustomers()` — real pagination against the live, schema-verified
  `customers(take, skip)` signature, loops until a short page, capped at
  20 pages as a runaway guard.
- `previewHomeworksSync()` — fetches every accessible customer, compares
  against existing Supabase clients three ways (homeworks_id match =
  update, phone/email match on a client with no homeworks_id = possible
  duplicate — flagged, never auto-merged, no match = create). Entirely
  read-only.
- `confirmHomeworksImport()` — the actual write path, but it can only ever
  run from your own authenticated click behind a native confirm() dialog
  naming the exact counts. This agent has no way to invoke a Server Action
  itself (no authenticated session, no service-role key locally, confirmed
  again this session) — so "don't import while I'm asleep" was true
  structurally, not just because I chose not to. Reuses
  `syncHomeworksEntity`, the same already-tested upsert-by-homeworks_id
  logic the Zapier webhook has used since it was built, rather than a
  second parallel write path. Always skips `possible_duplicate` rows.
- Fixed a real mislabeling bug you flagged: "Zapier: Not Connected" next
  to "Homeworks: 2 customers synced" looked contradictory but wasn't — two
  genuinely different things (the Homeworks card verifies real Zapier-
  webhook-synced data; the separate "Zapier" card checks an unrelated,
  never-built outbound-automation path). Renamed both cards so this can't
  be misread again.
- Fixed the AI Provider card's self-contradiction (badge said "Needs
  Setup," description said "the AI Advisor is live") — it now correctly
  shows "Connected" when configured, since unlike QuickBooks/Google
  Calendar (genuinely zero integration code), the AI Advisor is fully
  built and has been extensively verified across this whole engagement.

**Still genuinely unverified, stated plainly**: whether `getAllCustomers()`
and the import actually work against your real, authorized Homeworks
account. I re-verified the OAuth client registration and the exact
production redirect URI are correct by building a real authorization URL
and navigating to it (got the real Homeworks consent screen both times),
and I re-verified the GraphQL query shape against the raw schema file
line by line — but I cannot execute an authenticated query myself. That
requires your own browser session, which this environment structurally
does not have.

**Exact next action**: open Settings → "Homeworks (real API)" card. If it
still shows "Connect Homeworks" (not Verify/Preview buttons), the
migration genuinely hasn't been run yet, or the fix above will now show
you the real error — read it and it'll say exactly what's wrong. If it
already shows Verify/Preview, click **Preview full sync** first (read-only,
safe, shows real counts) and review the numbers before clicking **Confirm
Import**.

## OAuth authorization completed by the owner — paginated sync preview built

The owner completed the Homeworks OAuth login (previous sessions only got
as far as a verified-but-unauthorized connection). Two Vercel env-var
data-entry issues along the way (the value field ending up containing
`HOMEWORKS_OAUTH_CLIENT_ID=<uuid>` once, then `UUID.<uuid>` once) were
diagnosed by re-verifying the bare client_id directly against the live
Homeworks authorize endpoint each time — confirming both were config
issues, not code bugs, before saying so.

**Structural limitation, stated plainly**: this environment cannot execute
an authenticated Homeworks query using the owner's now-stored production
token. `homeworks_oauth_connection` is RLS-protected to `authenticated`
only, this environment has never had a Supabase service-role key locally
(confirmed directly, not assumed — same as every prior session), and this
agent does not log into the app itself. So "how many real customers did
you retrieve" could not be answered directly by me this session — only the
owner, from their own authenticated browser, can trigger that call. This
was said clearly instead of attempting to fake or infer a number.

**What was built instead**, so the owner gets a real answer the moment
they click a button:
- `getAllCustomers()` (`lib/integrations/homeworks-api.ts`) — real
  pagination using the live schema's actual `customers(take, skip)`
  signature (verified against the schema file directly, not assumed from
  memory of an earlier fetch), looping until a page returns short, capped
  at 20 pages (4,000 customers) as a runaway guard.
- `previewHomeworksSync()` (`lib/actions/homeworks-sync-preview.ts`) —
  fetches every accessible Homeworks customer and compares against
  existing Supabase `clients` three ways: exact `homeworks_id` match
  (would update), phone/email match to a client with no `homeworks_id`
  (possible duplicate — flagged, not silently merged), no match (would
  create). Entirely read-only — no import/write path exists yet, matching
  the explicit instruction to preview before any bulk write, and matching
  "start with read-only."
- Settings' Homeworks card gained a **Preview full sync (all customers,
  read-only)** button showing real counts (would-create / would-update /
  possible-duplicates) and every record with its proposed action.
- Verified the exact GraphQL query shape (`Customer.properties(...)`
  called with no arguments, since all its params are optional) against
  the raw schema file line by line — not just individually-confirmed
  field names, the actual nested call shape used in the real query.

**Not built yet**: the actual bulk-write import (explicitly deferred —
requires the owner to review real preview numbers first, per their own
instruction). Jobs/events, estimates, and invoices sync — schema
signatures for all three are already verified and match the same
`skip`/`take` pagination pattern, so extending pagination to them is
mechanical once customer sync is confirmed accurate by a real preview run.

**Exact next action for the owner**: open Settings → Homeworks (real API)
card → click **Preview full sync** → report back the real numbers shown
(total customers, would-create/would-update/duplicate counts). That's the
number I could not get myself this session, and it's what determines
whether the matching logic above needs adjustment before an import button
gets built.

## 🎉 HOMEWORKS: a real, live, verified API connection now exists

Everything below was verified directly against the live `api.home.works`
API this session — not read from documentation and trusted, actually
probed. Your own account inspection (secure.copilotcrm.com — no visible
API/developer menu) was correct: there genuinely is no such menu, because
registration isn't a UI feature at all. It's OAuth Dynamic Client
Registration (RFC 7591) — a pure API call, "self-serve... no approval
required." That's why it wasn't findable by clicking around Settings.

**What's real and verified, in order:**
1. Discovery document fetched live: `https://api.home.works/.well-known/oauth-authorization-server` returns real endpoints (authorize, token, registration, JWKS), OAuth 2.1 + PKCE (S256), no client secret (`token_endpoint_auth_methods_supported: ["none"]`).
2. Registered a real OAuth client via `POST https://api.home.works/oauth/register` — got back a real `client_id` (`80490095-ab1b-4acb-8c41-92450448511a`), HTTP 201. This is a public identifier, not a secret (PKCE secures the flow), so it's safely stored in `HOMEWORKS_OAUTH_CLIENT_ID`.
3. Downloaded the real GraphQL schema (`https://api.home.works/graphql/schema.graphql`, 210KB) and confirmed exact field/query names: `customers(where, skip, take, orderBy): [Customer!]!`, `Customer.fullName/address/properties`, `Property.customerId`, etc. — nothing guessed.
4. Built the authorization URL with the real client_id and valid PKCE parameters, navigated to it in a real browser — **got back a genuine Homeworks "Authorize Access" consent screen** reading "Jarvis (WeedEater Lawn Care) is requesting access to your Homeworks openid company account," with real email/password fields. Screenshotted, confirmed, navigated away without entering anything (I don't enter credentials, ever — that's your login to complete).

**A real bug found and fixed via a live e2e test, not just typechecking**: `proxy.ts`'s password-recovery redirect (built two sessions ago) intercepts *any* request with a `?code=` query param and redirects it to `/reset-password` — which would have silently swallowed the Homeworks OAuth callback's own `?code=...` before it ever reached its route handler, breaking the whole flow. Caught because I wrote a real Playwright test for the new callback route and it failed with exactly this redirect. Fixed by excluding `/api/*` paths (Supabase's recovery redirect never lands directly on an API route, so this can't reintroduce the original bug). 34/34 e2e now, up from 30.

**What I built:**
- `lib/integrations/homeworks-oauth.ts` — PKCE generation, authorize URL builder, token exchange/refresh, against the real, verified endpoints.
- `lib/integrations/homeworks-connection.ts` — server-only token storage with auto-refresh (1hr access token, 14-day refresh token — real numbers from the live docs).
- `lib/integrations/homeworks-api.ts` — a GraphQL client and a real, schema-verified `getSampleCustomers()` query.
- `/api/integrations/homeworks/oauth/connect` and `/callback` routes — both owner-session-gated (e2e-tested).
- A new "Homeworks (real API)" card on Settings with a **Verify** button that actually calls the live API for 5 real customers and shows what came back — not a static "Connected" badge.
- `supabase/homeworks-oauth-migration.sql` — one more migration to add to the batch (below).

**What's NOT done, honestly:** the actual authorization step — you logging into that real consent screen — hasn't happened, because only you can do it. Until you do, "Verify" will correctly report not connected. This environment also still has no authenticated browser session (same constraint as last session), so the full Settings-page UI flow (click Connect → log in → land back on Settings → click Verify → see real customers) is implemented and e2e-tested at the auth-boundary level, but not click-through verified end to end.

**Your exact next action:**
1. Run the now-three pending migrations (see the updated list below — `homeworks-oauth-migration.sql` is new).
2. Open Jarvis → Settings → find the new "Homeworks (real API)" card → click **Connect Homeworks** → log into the real Homeworks consent screen with your own credentials → you'll land back on Settings.
3. Click **Verify — fetch 5 real customers**. If it shows real names, the connection genuinely works. If it errors, send me the exact error text — the most likely one, per Homeworks' own docs, is a plan-tier gate ("API access requires an Enterprise plan or an active Growth trial") — I cannot see your plan tier from here, so if that's the error, that's a Homeworks account/billing question, not a bug in Jarvis.

## ⚠️ ACTION NEEDED FROM YOU — a few minutes, before these features work

Three database migrations are written but **not yet applied** — I have no
way to run SQL against your live Supabase project myself (no DB console
access, no linked CLI, confirmed directly this session — see below). Until
you run these: Command Center's "Today's Mission"/"Business Pulse" cards
show a graceful "couldn't load" error (not broken data, not a crash),
photo upload fails with a clear inline error, and the new Homeworks OAuth
connection has nowhere to store its tokens.

1. Open your Supabase project → **SQL Editor**.
2. Paste and run `supabase/demo-data-classification-migration.sql`.
3. Paste and run `supabase/photo-upload-migration.sql`.
4. Paste and run `supabase/homeworks-oauth-migration.sql` (new this session).
5. **Also add one Vercel env var** (Vercel dashboard → this project →
   Settings → Environment Variables → add for Production):
   `HOMEWORKS_OAUTH_CLIENT_ID` = `80490095-ab1b-4acb-8c41-92450448511a`.
   This is a public OAuth client identifier, not a secret (PKCE secures the
   flow, no client secret exists) — safe to see in this file. Without it,
   Settings' "Connect Homeworks" button will show "not configured" on
   production even though it works locally (where it's already in
   `.env.local`). Redeploy after adding it (Vercel usually does this
   automatically on env var changes, but check).
6. Refresh Jarvis — Today's Mission and Business Pulse should load normally,
   the Photos section on any Job/Property page should accept an upload, and
   Settings' new "Homeworks (real API)" card is ready for you to click
   Connect.

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

## Seventh-session changes — resumed after a usage-limit pause

Phase A (recover and verify) first: `git log`/`git status` showed a clean
tree at commit `9dc7550`, matching exactly what the sixth session's
write-up claimed. `typecheck`/`lint`/`build`/`playwright test` all rerun
clean as a real baseline, not assumed from the prior write-up.

**Hard constraint discovered and confirmed, not assumed:** this session's
browser pane had no authenticated cookie (the pause was long enough that
the prior session's login expired), and this environment has never had a
`SUPABASE_SERVICE_ROLE_KEY` locally (confirmed directly this session, not
just recalled from a doc — the key is present in name but empty in
`.env.local`, by design, same as every prior session). I do not enter
passwords into login forms, including for a test account I could create
myself — that's a hard rule, not a time-saving shortcut I skipped. Net
effect: **no live-browser verification of any authenticated workflow was
possible this session.** Where that matters below, it's stated plainly
rather than glossed over.

Given that constraint, this session's real, verifiable work was: (1) a
correctness/security review of what the sixth session built (found no
bugs — the manual Job form already exposed status/actual_hours/
completion_notes, `getPropertyOptions()` already labels each option with
its owning client so a job can't easily land under the wrong customer,
and `job_photos` already had a blanket authenticated-RLS policy that makes
the sixth session's new photo policies safely redundant rather than
conflicting), (2) fixing two stale documentation files that were actively
misleading (`docs/CURRENT_STATE.md` still said the app "isn't deployed
anywhere yet," which stopped being true many sessions ago), and (3) real
new functionality that doesn't require a browser session to verify —
because it's testable the same way the AI streaming work was verified two
sessions ago: a temporary, git-clean debug route hitting the real code
directly, deleted before committing.

### Work-sheet photo extraction — genuinely verified, not just typechecked

Priority 5's second milestone. `src/lib/ai/work-sheet-extraction.ts` — a
one-shot Claude vision call (deliberately separate from the AI Advisor's
streaming tool-calling pipeline; coupling them would risk destabilizing
the advisor loop for an unrelated feature), instructed to extract a work
date, customer name, property address, service description, crew members,
hours, price, and notes from a photo — every field explicitly null rather
than guessed when not legible, with an `uncertain_fields` list and a
`legible: false` flag for an unreadable image.

**Actually tested against the live Anthropic API this session** (not just
built and typechecked):
- A trivial blank 1×1 test image correctly came back
  `legible: false`, every field null, with a sensible explanation —
  proving the model doesn't hallucinate content into an unreadable image.
- A synthetic work-sheet image (rendered via an in-browser canvas with
  "Date: 9/15/26, Customer: Travis Willams, Service: Mowing + edging,
  Crew: Nate, Time: 45 min, Price: $70, Note: gate left open") came back
  with `work_date_guess: "2026-09-15"` (correctly normalized from
  "9/15/26"), `customer_name_guess: "Travis Willams"` (a name that matches
  a real client already in the database), `hours_worked_guess: 0.75`
  (correctly converted from "45 min"), `price_guess: 70`, the crew member
  and note both captured correctly, and one field flagged uncertain even
  though it was read correctly (appropriately cautious, not a failure).
- This is real verification of the extraction logic itself. It is **not**
  verification of the full upload → extract → review → save UI flow,
  which needs the authenticated browser session this environment didn't
  have this time.

Built on top of extraction: `extractPhotoInfo` (lib/actions/photos.ts) —
downloads a previously-uploaded photo from private Storage and runs it
through extraction; `createJobFromWorkSheet` — saves the owner-reviewed
(possibly corrected) fields as a real completed job via the same
`insertJob` every other job-creation path uses, and links the source
photo to the resulting job. `components/photos/work-sheet-extraction-
panel.tsx` — appears next to a just-uploaded photo on a Property page
with a "Read this as a work sheet" button (extraction is owner-initiated,
never automatic — no API cost spent without being asked for), then shows
the extracted fields as an editable form before any of it can be saved.
Deliberately scoped to the Property page only (not a general upload
page) — the property is already known from page context, so v1 doesn't
need a customer/property search-and-match UI, matching the explicit
instruction not to let a bulk-processing architecture delay a working
single-file flow.

### Documentation debt fixed

`docs/CURRENT_STATE.md` and `docs/DATA_AUTHORITY.md` were both stale
enough to actively mislead a future session (the former claimed no
production deployment exists; the latter claimed "nothing syncs in or out
yet" despite the Homeworks webhook/import path having existed for several
sessions). Both rewritten to match reality, with explicit "trust
JARVIS_PROGRESS.md's per-session log over this file" pointers so this
doesn't quietly happen again.

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
