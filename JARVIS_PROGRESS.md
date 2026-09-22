# Jarvis Progress — Resumable Handoff

**Last updated:** 2026-09-22, Phase H continuation (deployment verification, integration test coverage, a real secret-boundary fix, failed-webhook logging, range reconciliation, and a real-component mobile review — in direct response to the owner's follow-up after the previous report).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Repo:** natehall9876/Jarvis_Dashboard, branch `main`.
**Latest pushed commit:** `2a263b1`. Vercel's connected auto-deploy builds every push to `main` — deployment of this commit was in progress ("pending") as this was written; confirm in Vercel's dashboard that it finished and that the live commit hash matches.

**Structural limitations carried forward, stated once:**
- No login to the deployed app, no Supabase Studio/Vercel dashboard access, no real OAuth provider credentials, no real microphone.
- This checkout's local `SUPABASE_SERVICE_ROLE_KEY` is blank (unlike production).
- A script calling Supabase's Auth Admin API (read-only `listUsers`) was explicitly denied by this sandbox's permission classifier last session. **Not retried this session, through this or any other route**, per direct instruction — see the Access Control row below for the one specific thing this blocks.

---

## THIS SESSION'S TASK MATRIX (continuation)

| # | Ask | What was done | Evidence | Remaining |
|---|---|---|---|---|
| 1 | Verify deployment | Checked GitHub's commit-status/check-runs API (public repo, no token needed). Vercel's deployment of the prior commit **succeeded**. But the repo's own GitHub Actions CI was **failing** — a real, pre-existing bug unrelated to this session's other work: `npm run typecheck` (bare `tsc --noEmit`) fails on any genuinely clean checkout because Next.js 16 writes route/layout prop types (`LayoutProps<"/">`, used in `layout.tsx`) into `.next/types/`, generated on demand by `next dev`/`next build`, never committed. It only "worked" locally because this session's own working directory already had stale `.next/types` on disk from earlier commands. | Fixed: `next typegen` now runs before `tsc --noEmit` in the `typecheck` script itself. Verified by actually deleting `.next/` and `next-env.d.ts` and confirming `npm run typecheck` passes from that genuinely clean state — not just reasoning about it. CI is now green (`09ac81e` and every commit since, confirmed via the check-runs API). | Confirm in Vercel's own dashboard that production is running `2a263b1` (or later) |
| 2 | Finish QuickBooks/Calendar verification | Extracted the callback state-validation logic (previously untestable — every callback route requires a session, and no test account exists here) into a pure `validateOAuthCallback()`, and the token-expiry decision into `isExpiringWithin()`. 30 new tests exercise the real production functions directly: provider-declined auth, missing/mismatched state, a cookie-name collision, Homeworks' extra PKCE cookie, the exact expiry boundary, and — via mocked `fetch`, no real credentials — successful exchange, a rejected/expired code, a network failure, a revoked refresh token, and a successful refresh, plus that `revokeToken()` never throws. | `e2e/oauth-integrations.spec.ts` (30 tests, all pass); added the matching unauthenticated-redirect probes for QuickBooks/Calendar to `security-probe.spec.ts` | None — this is genuinely tested now, not just typechecked |
| 2b | "Inspect token storage, ensure secrets stay server-side" | Found a **real** leak, not hypothetical: `lib/env.ts` mixed the public Supabase anon key together with every OAuth secret/webhook secret/service-role key in one module; because the public half is legitimately imported by a client-reachable file, the WHOLE module — including the secret half's `process.env.X` references — ended up in a client-shipped JS chunk. Confirmed by grepping a real production build's `.next/static/` output, not by reasoning about the import graph. | Split into `env.ts` (public only) / `env.server.ts` (everything secret); wrote `scripts/check-no-client-secrets.mjs`, wired into CI right after `npm run build`, verified it (a) passes clean now and (b) actually catches a planted synthetic leak (exit code 1) before trusting it | None — actual secret VALUES were never inlined (Next only inlines `NEXT_PUBLIC_*`), so no credential was ever actually exposed, but the reference-chain violation was real and is now fixed and guarded going forward |
| 2c | Check migrations, determine live status | Re-verified `quickbooks-oauth-migration.sql` and `google-calendar-oauth-migration.sql` column-by-column against their consuming code (already correct — no changes needed). Wrote and verified `homeworks-sync-failures-migration.sql` the same way. | Static review only — see the access-denial note above | **Cannot verify live application status from this session.** Exact SQL + order below. |
| 3 | Finish failed-webhook logging | Built `homeworks_sync_failures` (a new, dedicated table — NOT attached to a fake or unrelated business-record id, which `activity_log`'s required uuid would have forced). Three reasons: `invalid_secret`, `invalid_payload`, `processing_failed`. The two rejection messages are fixed constants (redaction verified with a canary-value test: the provided secret never appears in the response). Logging is best-effort on the fast-fail paths specifically so a missing database can't turn a correct 401/400 into a wrong 503 (a real ordering trap this session introduced and then caught with its own regression test). | `e2e/homeworks-sync-failures.spec.ts` (new); Settings' Sync status panel now shows recent failures | Failure rows for a genuinely orphaned record (parent not synced) were already covered by the pre-existing early-return paths in `syncHomeworksEntity` — now logged too |
| 4 | Mobile review with real components | `/voice-lab/jobs/[id]` was a literal one-line stub. Extracted the real job page's view into `job-detail-view.tsx` (the real dashboard page is now a thin wrapper around it) and rendered it in the lab with fixture data — genuinely the same component, not a hand-copied twin. Verified live at 375px width in the browser pane. | Found and fixed 2 real issues this surfaced: (a) the lab's own shell was missing the real dashboard layout's dock-clearance bottom padding (fixed to match — confirmed the true end of the page now clears the floating dock); (b) measured real touch-target sizes via the DOM — Edit (34px), the status dropdown (38px), and Upload (40px) are under the 44px guideline the mic button already meets. **Not fixed** — a `Button` component sizing change affects every button in the app and needs its own dedicated pass, not a same-turn bundle | Only the job page got this treatment (time-boxed) — Schedule/Command Center/Client detail were not upgraded from their stub/real state this session; production, signed-in verification of any dashboard page remains undone |
| 5 | Homeworks reconciliation, any range | Generalized the existing single-day reconciliation (`reconcileDay`, already using the app's own real Homeworks connection + Jarvis database) to `reconcileRange()` — runs the same, unmodified day logic once per date and aggregates, so no matching logic was duplicated. Settings' reconciliation panel gained a One day / Date range toggle (This week / Next 30 days presets, capped at 92 days). Distinguishes "job-days" (a multi-day event counted once per spanned day) from "unique events". | 8 new pure-logic tests (`e2e/homeworks-reconcile-range.spec.ts`) | This is a live, re-runnable feature now — re-run it from Settings for current numbers rather than treating any number in this file as permanent |
| 6 | Precise setup handoff | See below | — | — |
| — | Access control (from the prior report) | **Still specifically blocked**: the read-only Supabase Auth Admin API check was denied by this sandbox's permission classifier and was **not retried through another route** this session, per direct instruction. All unrelated work continued. | Denial captured verbatim last session: "Blocked by classifier" | Owner: Supabase Studio → Authentication → Users (confirm count) and → Providers → Email → "Allow new users to sign up" (confirm disabled) |

---

## EXACT SETUP STEPS (the smallest remaining list)

**QuickBooks:**
1. developer.intuit.com → your app → Keys & OAuth → add Redirect URI: `https://jarvis-dashboard-fawn.vercel.app/api/integrations/quickbooks/oauth/callback`
2. Copy the **Production** Client ID/Secret (not Sandbox, once ready for the real company file).
3. In Vercel: Project → Settings → Environment Variables → add `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` there (never paste a secret into this chat or any chat — Vercel's Environment Variables page is the actual place these belong).
4. Redeploy (Vercel does this automatically on the next push, or trigger a redeploy from its dashboard to pick up new env vars on the current commit).
5. In Jarvis: Settings → QuickBooks card → Connect QuickBooks → sign in with the Intuit account for the real company file → Verify (fetches CompanyInfo for real) → Preview financial summary.
6. Scope requested: `com.intuit.quickbooks.accounting` (read-only in practice — this app has no QuickBooks write code path at all).

**Google Calendar:**
1. console.cloud.google.com → a project → APIs & Services → Library → enable **Google Calendar API**.
2. APIs & Services → OAuth consent screen → add scope `https://www.googleapis.com/auth/calendar.readonly`. If the screen is in Testing mode, add the owner's Google account as a test user (simplest for single-owner use — avoids Google's app-verification review).
3. APIs & Services → Credentials → Create OAuth client ID (Web application) → Authorized redirect URI: `https://jarvis-dashboard-fawn.vercel.app/api/integrations/google-calendar/oauth/callback`
4. In Vercel: add `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` (same place, never in chat).
5. Redeploy.
6. In Jarvis: Settings → Google Calendar card → Connect Google Calendar → choose a calendar → Preview next 14 days.

**Migrations** (Supabase SQL editor, any order — no interdependencies):
1. `supabase/quickbooks-oauth-migration.sql`
2. `supabase/google-calendar-oauth-migration.sql`
3. `supabase/homeworks-sync-failures-migration.sql`

Each was re-verified column-by-column against its consuming code this session. Live application status could not be checked (see Access Control row) — run `select count(*) from public.quickbooks_oauth_connection;` (etc.) in the SQL editor to confirm a table already exists before re-running its migration, or just re-run them: every one is written to be idempotent (`create table if not exists`, `drop policy if exists` before `create policy`).

**Access control:** Supabase Studio → Authentication → Users (confirm the count is what you expect) and → Authentication → Providers → Email → confirm "Allow new users to sign up" is off, if it isn't already.

**Vercel:** confirm the deployed commit is `2a263b1` or later.

---

## WHAT'S ALREADY BUILT (cumulative, unchanged section from before)

See git log for full detail — Homeworks direct API + Zapier webhook (now with failure logging), Notes & tasks, Photos, Voice (now with a diagnostics view), Command Center, Schedule, QuickBooks/Google Calendar OAuth (now with real test coverage), Homeworks reconciliation (now range-capable).

## NEXT EXECUTABLE STEP (if this session is interrupted)

1. Confirm Vercel deployed `2a263b1`+ (check its dashboard).
2. Run the 3 migrations above if not already applied (verify first — see above).
3. Supply real QuickBooks/Google Calendar credentials via Vercel's env vars (not chat) if ready to connect either.
4. Owner: Supabase Studio → Authentication → Users, to close out the one specifically-blocked check.
5. If continuing the mobile pass: Schedule and Client detail pages haven't had the same real-component fixture treatment the job page got this session — same pattern (extract a `*View` component, fixture it in `/voice-lab`) would apply directly.
