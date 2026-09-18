# Current State

Last rewritten: 2026-09-18. The version of this file before today claimed
the app "isn't deployed anywhere yet" — that was true on 2026-09-10 and has
been false for many sessions since; nobody updated this file as things
changed. Trust `JARVIS_PROGRESS.md`'s per-session log over this file for
anything time-sensitive — this file is a slower-moving summary, and it has
already gone stale once. `npm run typecheck`/`lint`/`build`/`playwright
test` all pass as of commit `9dc7550` (2026-09-18) — a real local run, not
carried over from an earlier write-up.

## Deployed and live

**Production:** https://jarvis-dashboard-fawn.vercel.app, on Vercel,
auto-deploying from `origin/main`. Confirmed reachable via direct HTTPS
probe after every push this whole engagement (redirect-to-login on `/`,
200 on `/login`) — that proves the deployment is healthy, not that every
individual feature works; this environment has no way to complete a real
login itself (see `JARVIS_PROGRESS.md` — no service-role key locally,
credentials are never entered by the agent), so anything requiring an
authenticated session can only be verified when the owner is present with
the browser pane open, or asserted "implemented, not live-verified" when
they aren't.

## Live and verified (as of 2026-09-10 — a historical baseline, not the full current picture)

Everything below was true and verified on 2026-09-10. It has not been
disproven since, but sessions after this date added streaming AI
responses, prompt caching, markdown rendering, a full visual redesign
(brand green `#72F238`, fixed sidebar, mobile bottom tab bar), Homeworks
webhook/import sync, demo-data classification, and a photo-upload
foundation — none of which is described in this section. See
`JARVIS_PROGRESS.md`'s per-session log for everything since.

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

## Built in code, status in the live database UNKNOWN to this agent

This environment has never had a service-role key or a linked Supabase CLI
project in any session — DDL has never once been executed from here. Every
migration below was written as a `.sql` file for the owner to run in
Supabase Studio's SQL Editor; whether any given one has actually been run
is only known if a session had a live authenticated browser to check with,
or the owner said so directly. Don't trust an earlier session's optimism
about this without one of those two things.

| Migration | What breaks if NOT applied | Fails how |
|---|---|---|
| `supabase/activity-log-migration.sql` | Job/invoice/quote History cards show "No activity recorded yet" instead of real entries | Silent, graceful (`getActivityForEntity()` catches the missing-table error) |
| `supabase/action-requests-migration.sql` | Write-action idempotency falls back to in-memory (safe within one process, not across a restart) | Silent, graceful fallback |
| `supabase/demo-data-classification-migration.sql` | Command Center's Today's Mission + Business Pulse cards show a "couldn't load" error instead of demo-filtered totals | Visible error card, not a crash, not wrong data |
| `supabase/photo-upload-migration.sql` | Photo upload fails with an inline error; the `job-photos` bucket may not exist or may still be public | Visible inline error on upload attempt |

All four are additive-only (no existing table/column/row touched) and safe
to re-run. Apply via Supabase Studio → SQL Editor → paste → Run. After
running all four, regenerating `src/types/database.types.ts` via
`supabase gen types typescript` should match what's already hand-written.

## Known gaps

- Only 4 Jarvis write actions exist. No invoice/quote/client writes, no
  customer messaging, no deletions.
- `activity_log` is only wired into jobs, invoices, and quotes — not clients,
  properties, or equipment yet.
- No dedicated recommendations table with accept/reject/outcome history.
- No route-level (only company-wide) true-paid production rate.
- No employee-facing view — owner-only right now.
- No real QuickBooks or Google Calendar integration — Settings honestly
  reports each as not connected. Homeworks is partial: one-directional
  sync (Homeworks → Supabase) via a Zapier webhook + owner-run bulk import
  exists and is deployed; real Homeworks API/OAuth connectivity for Jarvis
  to query Homeworks directly does not exist yet (see `JARVIS_PROGRESS.md`
  for the exact blocker and next action).
- No automated test suite (Playwright/CI) as of this writing — see
  `docs/TESTING.md` for status.
