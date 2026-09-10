# Current State

Last verified: 2026-09-10, against a real local run (`npm ci && npm run
typecheck && npm run lint && npm run build`, all clean) plus a live manual
click-through trial in-browser.

## Live and verified

- Login, session persistence, sign-out.
- Command Center: Today's Mission, Business Pulse (including field vs.
  true-paid production rate), Priorities, Weather (National Weather
  Service), AI Owner Advisor panel.
- Clients → Properties → Jobs navigation, all real links, verified by
  clicking through in a browser (not just reading the code).
- Schedule (Day/Week), job cards link to job detail.
- Jarvis: real Anthropic tool-calling over live Supabase data, verified with
  real owner questions including multi-turn follow-ups and page-context
  grounding.
- Jarvis write actions: reschedule job, change job status, assign/change
  crew, create job — all verified end-to-end (propose → confirm → verify →
  cancel-is-a-no-op) against dedicated test records, including stale-record
  rejection, malformed payload rejection, duplicate-confirmation rejection
  (both sequential and genuinely concurrent), and ambiguous-request
  clarification.
- Voice input (Web Speech API) feeding the same `submit()` path as typed
  text; verified via a mocked `SpeechRecognition` (no real mic available in
  the dev sandbox) that a transcript containing "confirm" never calls the
  execute-action endpoint.
- Mobile (375px) rendering of Command Center, mobile nav, Jobs list (cards),
  job detail, and the Jarvis drawer including a full propose/confirm cycle.
- Settings/Integrations page: live-verified status for Supabase and Weather,
  honest credential-only status for everything else.
- Security re-audit (deep hardening pass, same day): unauthenticated direct
  access to a real record URL redirects to `/login` (regression-tested);
  `/api/ai-advisor` now requires auth (previously RLS blocked real data for
  an anon caller, but nothing stopped an anon caller from spending a real
  paid Anthropic API call — fixed); `/api/ai-advisor/execute-action` confirmed
  401s with no session; malformed job ids don't crash the server. All 4
  codified in `e2e/security-probe.spec.ts`.
- Action-safety re-stress-test (same day, more aggressive than the original
  pass): 5 fully concurrent confirmation requests for the same proposed
  action → exactly 1 succeeded, 4 correctly rejected as
  `already_processed`, independently verified the job moved exactly once.
  Contradictory multi-turn correction ("move it to Monday" → "actually,
  Tuesday instead") produces a fresh proposal without ever double-writing,
  since neither intermediate proposal is confirmed until the owner acts.
- Confirmed: no Supabase Realtime subscriptions exist anywhere in the
  codebase (grepped, not assumed). "Live updates" today means
  `router.refresh()` after your own confirmed action, not push updates from
  other clients/processes — an appropriate scope for a single-owner tool,
  not a bug, but don't mistake it for multi-client realtime sync if that's
  ever needed later.

## Built in code, NOT yet live in the database

Two tables exist fully in `src/types/database.types.ts` and are used by the
app (with graceful fallback), but have not been applied to the real Supabase
project — **this environment only has an anon/publishable key, never a
service-role key or a linked Supabase CLI project, so DDL cannot be executed
from here.**

### `activity_log`
- Migration: `supabase/activity-log-migration.sql`
- What breaks without it: nothing. `getActivityForEntity()` catches the
  missing-table error and returns an empty list; job/invoice/quote History
  cards show "No activity recorded yet" instead of an error.
- What starts working once it's applied: every job/invoice/quote mutation
  (both Jarvis-driven and the human edit forms) starts writing real rows,
  and History cards populate.

### `action_requests`
- Migration: `supabase/action-requests-migration.sql`
- What breaks without it: nothing. The executor falls back to an in-memory
  "already processed" guard (real protection within one running server
  process, but not across a restart or multiple instances).
- What starts working once it's applied: true cross-process, restart-proof
  exactly-once execution, enforced by a Postgres primary-key uniqueness
  constraint rather than process memory.

**To apply both:** open Supabase Studio → SQL Editor → paste the contents of
each file → Run. Both are additive-only (no existing table, column, or row
is touched) and safe to re-run. After running them, regenerating
`src/types/database.types.ts` via `supabase gen types typescript` should
produce shapes identical to what's already hand-written there.

## Deployment readiness

**Not deployed anywhere yet** — there is no `.vercel/` directory, no
`vercel.json`, and no Vercel account/project credentials available in this
environment, so a deployment could not be created or even attempted from
here. Everything else needed for a clean deploy has been verified ready:

- `npm run build` succeeds with **zero environment variables present**
  (tested by removing `.env.local` entirely and rebuilding) — the app never
  requires secrets at build time, only at request time.
- No hardcoded `localhost` anywhere in `src/` (grepped, not assumed) — every
  redirect (`src/proxy.ts`, `src/app/(auth)/login/actions.ts`,
  `src/app/auth/confirm/route.ts`) uses relative paths, so the app doesn't
  care what domain it's actually served from.
- `next.config.ts` has no custom settings that would need adjusting per
  environment.

**When you're ready to deploy, the remaining steps are:**

1. Create a Vercel project from this GitHub repo (`natehall9876/Jarvis_Dashboard`).
2. Add these environment variables in the Vercel project settings (same
   names as `.env.local`, real values — never commit them):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `AI_PROVIDER_API_KEY`, `AI_PROVIDER_MODEL`, `WEATHER_LOCATION_LAT`,
   `WEATHER_LOCATION_LON` (the rest are optional/unused today).
3. In the Supabase dashboard → Authentication → URL Configuration, add the
   real Vercel URL to **Site URL** and **Redirect URLs** — without this,
   the `/auth/confirm` email-link flow will redirect to the wrong domain
   (sign-in with password is unaffected either way).
4. Deploy. Open the Vercel URL on your iPhone.

Nothing about the two pending Supabase migrations
(`activity_log`/`action_requests`) blocks deployment — the app runs
correctly with or without them, as documented above.

## Known gaps

- Only 4 Jarvis write actions exist. No invoice/quote/client writes, no
  customer messaging, no deletions.
- `activity_log` is only wired into jobs, invoices, and quotes — not clients,
  properties, or equipment yet.
- No dedicated recommendations table with accept/reject/outcome history.
- No route-level (only company-wide) true-paid production rate.
- No employee-facing view — owner-only right now.
- No real QuickBooks, Homeworks, or Google Calendar integration — Settings
  honestly reports each as not connected.
- No automated test suite (Playwright/CI) as of this writing — see
  `docs/TESTING.md` for status.
