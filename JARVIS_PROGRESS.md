# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-22, overnight execution session (owner asleep, working autonomously through the priority list below).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Repo:** natehall9876/Jarvis_Dashboard, branch `main`.

**Structural limitation, true for this entire session and every prior one:** this environment has no login to the deployed app (I will not enter a password, per standing instruction) and no direct Supabase/Vercel dashboard access. Everything marked "verified" below was checked via typecheck/lint/build/Playwright (334 tests, real payload shapes where the source is Homeworks — see live-verified facts) or via the real, authenticated Homeworks MCP connection the owner attached to this session. Everything that requires the owner's own browser session is marked **blocked — needs your session** with the exact click-by-click check to run.

---

## PRIORITY STATUS (this overnight session)

1. **Jobs won't open — FIXED, code-verified, NOT device-verified.** See below.
2. **Notes/tasks/photos** — in progress next.
3. **Connector status truthful** — not yet started this session (prior sessions built Homeworks preview/enrich/historical/sync-status panels; QuickBooks/Google Calendar/Zapier audit not yet done this session).
4. **Persistent voice** — built and simulated-tested in prior sessions (see below); not re-verified this session yet.
5. **Daily workflow coherence** — not yet started this session.

---

## PRIORITY 1 — JOBS WOULDN'T OPEN: ROOT CAUSE FOUND AND FIXED

**Root cause (confirmed by reading the code, not guessed):** `getJobById` used Supabase's `.single()`, which throws a raw, cryptic Postgres/PostgREST error ("JSON object requested, multiple (or no) rows returned") for the completely ordinary case of a job id that doesn't match any row — a stale link, a deleted job, a mistyped or truncated URL. On top of that, the job detail page's handling of a missing record was `if (!job) return null;` — which renders a **silently blank page**, not an error, not a 404, nothing actionable. Unlike the client and property pages, which already called Next's `notFound()` for a missing record, the job page (and, on inspection, five other detail pages) never did.

**Full scope found by systematic sweep** (grepped every `getXById` and every page for the same pattern) — **seven** detail pages had this exact defect, not just jobs:
- Jobs, Employees, Equipment, Invoices, Quotes, Properties, Routes.
- Only Clients was already correct (already called `notFound()`).

**Fix, applied to all seven:**
- `src/lib/data/shared.ts`: new `getOrNotFound()` helper — runs a `.maybeSingle()` query, collapses "no row" and "malformed UUID" into a clean `null` (never throws for either), throws for anything genuinely unexpected. New `isMalformedIdError()` pure classifier.
- `src/lib/data/{jobs,employees,equipment,invoices,quotes,clients,properties,routes}.ts`: every `getXById` now routes through `getOrNotFound`, returns `T | null` instead of throwing.
- Every corresponding `src/app/(dashboard)/{jobs,employees,equipment,invoices,quotes,properties,routes}/[id]/page.tsx`: `if (!x) return null;` → `if (!x) notFound();` (consistent with clients, and with the existing branded `src/app/not-found.tsx`, which has a "Back to Command Center" link).
- `src/lib/ai/tools/{jobs,employees,equipment,invoices,quotes,clients,properties,routes,actions}.ts`: every Jarvis tool that calls one of these `getXById` functions now explicitly checks for `null` and returns a clean "That X doesn't exist" message instead of trying to read a field off `null` (TypeScript caught every one of these — 8 files, ~15 call sites).

**Verified:**
- `npm run typecheck` — clean (this was how the AI-tool call sites needing a null-check were found: TypeScript refused to compile until every one was fixed, so this is provably exhaustive for the entire codebase, not just the files I thought to check).
- `npm run lint` — clean.
- `npm run build` — clean.
- `npx playwright test` — 334 tests, 333 pass + 1 known flaky (mobile-safari, a parallel-worker timing issue unrelated to this change, confirmed passing reliably in isolation — see `voice-flow.spec.ts:210`).
- New regression test: `e2e/job-not-found.spec.ts` (the malformed-id classifier, in isolation).

**NOT verified (needs your session):** I have not clicked a job in an authenticated browser, before or after this fix. This is the single most important thing to check first thing in the morning:
1. Open Schedule, click any job. It should open and show correct client/service/details.
2. Copy that job's URL, open it in a new tab / refresh it directly. Should load the same job again.
3. Manually edit the URL to a nonsense id (e.g. change one character of the UUID). You should now see the branded "404 — that page doesn't exist" screen with a link back to the Command Center, **not** a blank page.
4. Click a job from a customer page and from a property page too.

**Why I believe this was the actual bug, not just a plausible one:** every other job-opening code path I audited (link construction across the whole app, the Schedule page's render logic, the proxy/middleware, RLS) was already correct and null-safe. This was the one place where a completely ordinary condition (a job id that doesn't resolve) produced a broken page instead of a real screen. It is possible there is a second, unrelated cause I haven't found — if step 1 above still fails, tell me exactly what you see (blank page? spinner forever? an error message — what does it say?) and I'll keep digging from there.

---

## LIVE HOMEWORKS FACTS (verified via the owner's attached Homeworks MCP connection, not assumed)

- 25 active, non-deleted customers — confirmed this is the complete active roster (not a pagination artifact): querying with no filter at all returns the same 25.
- 47 deleted/archived Homeworks customer records exist (mostly placeholder test rows, plus 3 old duplicate entries of already-active customers under different IDs) — correctly excluded by the app's `isDeleted: false` filter.
- 142 OPEN (future/active) events, 82 CLOSED (completed) events, 0 CANCELLED/SKIPPED/WAITLISTED.
- Monday 2026-09-21: 10 real events, all OPEN — matches Jarvis exactly (reconciliation panel confirmed 10/10 the same day this was checked).
- Homeworks event fields verified live: `total` (price), `budgetedHours`, `closedAt` (real completion timestamp), `lineItems[].name` (the real service name — the event `title` is NOT the service name, e.g. "Jan Sparfven Grass" vs the line item "Grass maintenance").

---

## WHAT'S ALREADY BUILT (prior sessions, code-verified, real-device-unverified unless noted)

- **Homeworks direct API (OAuth 2.1 + PKCE)**, separate from the older Zapier webhook path. Customer/property linking, job sync (active + this session's new historical/completed-work backfill), enrichment (fills blank service name + budgeted hours from Homeworks line items, never overwrites), reconciliation panel (Homeworks vs Jarvis by event ID for one day), sync status panel (real linked-record counts + activity log, not a fake "Connected" badge).
- **Notes & tasks:** `supabase/job-notes-tasks-migration.sql` — owner confirmed this ran successfully. `job_notes` and `owner_tasks` tables, typed forms, and confirm-gated Jarvis voice tools (add note / create task / complete task).
- **Photos:** direct-to-Storage upload via signed URL (not a Server Action, which caps bodies at 1MB), server-side existence verification via `createSignedUrl` with retry/backoff (fixed twice this week for two different real bugs — see git log), private bucket, signed-URL-only display.
- **Voice:** one persistent `JarvisProvider` mounted at the dashboard layout (survives client-side navigation), speech recognition + sentence-streamed spoken replies, mute, barge-in, hands-free mode, deterministic voice navigation ("open my schedule"), entity lookup navigation (only on exactly one match), dock + bubble UI. Tested via a dev-only `/voice-lab` harness (404s in production) with a FAKE SpeechRecognition/speechSynthesis and a MOCKED advisor — proves the wiring, **not** a real microphone or real speech.
- **Command Center:** living particle-network hero, honest capability map (connected/partial/planned, never fabricated), briefing built only from real job rows, schedule-conflict + overdue-task alerts wired into the existing priorities list, Business Pulse split into completed/collected/scheduled/pending-estimate revenue.
- **Schedule:** day/week views, status filters, conflict detection, daily summary.

## WHAT IS NOT BUILT / NOT ASSESSED THIS SESSION

- QuickBooks: no integration code exists at all (confirmed by earlier sessions' capability map — `finances` capability explicitly says "QuickBooks is not connected"). Not re-verified this session.
- Google Calendar: no integration code found in prior sweeps. Not re-verified this session.
- Zapier: the existing webhook-based Homeworks sync IS the Zapier integration (separate from the direct API). Its live status not re-checked this session.
- Historical (completed-work) Homeworks sync: built, has never been run by the owner. Preview it before confirming.

## NEXT EXECUTABLE STEP (if this session is interrupted)

1. Verify Priority 1 in a real browser (the 4 steps above) — this is the highest-value single check.
2. Continue to Priority 2 (notes/tasks/photos) — code exists, needs the same kind of live click-through verification, plus continued static hardening.
3. Then Priority 3 (connector truthfulness — audit QuickBooks/Google Calendar/Zapier code, not just Homeworks).
4. Then Priority 4 (voice — real device test still outstanding).
5. Then Priority 5 (visual/workflow coherence pass).
