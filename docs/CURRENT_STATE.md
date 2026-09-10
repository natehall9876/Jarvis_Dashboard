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
