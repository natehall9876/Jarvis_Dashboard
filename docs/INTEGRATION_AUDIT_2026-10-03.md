# Integration audit — October 3, 2026

This is a timestamped audit, not a claim that external data is permanently current.
Canonical checkout: C:\Users\nateh\OneDrive\Documents\Jarvis_Dashboard.
Baseline: 9aa06f25d25f7b5e16472b4b5932570c4f1bbffe on main.
Production: https://jarvis-dashboard-fawn.vercel.app.

## Verified live, without reading token values

Supabase project pmxzldcltkfjkmtatvlu is ACTIVE_HEALTHY. Information-schema,
policy, index, aggregate, and migration queries succeeded directly.

| Item | Observed |
| --- | --- |
| Clients | 31 total; 25 Homeworks-linked; 25 homeworks_sync and 6 demo |
| Properties | 34 total; 26 Homeworks-linked |
| Jobs | 70 total; 48 Homeworks-linked |
| Future linked jobs as of Oct 3 | 18; latest scheduled date Oct 12 |
| Latest job change | Sep 25 01:59 UTC (Sep 24 evening Eastern) |
| Homeworks credential rows | 1; latest refresh stored Oct 2 01:46 UTC |
| QuickBooks credential rows | 1; latest refresh stored Oct 2 01:47 UTC |
| QuickBooks refresh expiry on file | Jan 11, 2027; this does not prove current provider validity |
| Google Calendar credential rows | 0 |
| Sync failure rows | 0; this does not prove deliveries were attempted |
| Legacy webhook-labeled activity | 70 rows, last Sep 25 01:58 UTC; provenance is ambiguous |
| job-photos bucket | Private |

All three OAuth tables exist with the columns expected by the code, RLS
enabled, and zero browser-role policies. Homeworks' historical table still
has legacy anon/authenticated grants; RLS denies row access. QuickBooks and
Google token-table browser grants are revoked. Business tables have
RESTRICTIVE owner guards using app_members, in addition to older permissive
authenticated policies. These guards compose with AND, not OR.

clients/properties/jobs/invoices have full unique homeworks_id indexes,
matching upsert conflict targets. action_requests, activity_log, job_notes,
owner_tasks, homeworks_sync_failures and app_members also exist.

Tracked database migration history contains:
- 20260923054036 owner_access_and_lead_pipeline
- 20260923054533 operational_search
- 20260923055547 read_only_integration_stores

Historical standalone SQL files predate that history. Their presence in the
repo is not evidence they need rerunning. Live schema, policies and indexes
were inspected; no production database writes or migrations were performed.

## Homeworks flow and the actual automation gap

The direct integration uses OAuth 2.1 PKCE and api.home.works GraphQL.
Settings can verify a sample, fetch all customers/properties, compare
existing links, preview/import jobs for a date range, reconcile differences,
enrich linked jobs and backfill history. Writes remain explicit owner actions.

The webhook and secret-authenticated bulk import use the shared upsert
adapter. Customers precede properties; properties precede jobs. Canonical
Homeworks IDs are stored as text, backed by unique indexes.

There is no scheduled polling job, cron route or background worker in this
checkout. Having tokens and imported records does not keep the schedule
current. The webhook depends on an external sender being configured; its
mapping, trigger coverage, enabled state and delivery attempts could not be
verified from the connected tools.

Found and fixed: shared upsert defaulted to webhook provenance, including
direct/manual imports. Old webhook-labeled logs cannot prove webhook
delivery. New records include explicit origin and provenance_version=2;
only that evidence drives verified webhook status. Old business/activity
records were preserved.

Remaining before enabling unattended writes: verify fresh source data,
external delivery coverage, and how to handle deletions, cancellations,
reschedules, inactive records and conflicts with owner-entered job fields.
Do not deploy an unconditional overwrite loop over real business data.

## OAuth reliability changes

- Google reconnect clears the prior account calendar selection after successful save.
- Reconnect upserts the existing connection atomically instead of deleting
  the old row before an insert that might fail.
- Refresh only returns success after persistence succeeds and affects a row.
- Parallel API reads share one refresh within a server process. This is not
  a distributed lock across Vercel instances; unattended multi-instance
  refresh still needs coordination.
- Missing admin configuration becomes a connection-status/token error.
- Token responses validate expiry/access/required refresh fields; invalid
  JSON or incomplete success responses are rejected.
- Provider token requests have a 15-second timeout. Raw token endpoint
  bodies are not forwarded into callback URLs or UI errors.
- Callback success/error redirects clear cookies at their actual OAuth path.
  Intuit denial is processed before requiring realmId.
- Stored authorization is labeled as stored authorization, not live verification.
- Truncated customer imports fail closed. Unavailable schedules show an
  unknown job count instead of zero.
- Google Calendar follows calendar-list pagination and empty pages. Event
  bounds use America/New_York with an exclusive next-day end, including DST.

QuickBooks API adapter implements reads only (company, customers, invoices,
payments). Intuit's accounting OAuth scope itself allows reads and writes;
read-only behavior is enforced by Jarvis's implementation, not that scope.
Google requests calendar.readonly and keeps previews separate from jobs.

## Configuration: local is not production

Local presence was checked without displaying values.

Present: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
HOMEWORKS_OAUTH_CLIENT_ID, HOMEWORKS_WEBHOOK_SECRET, AI provider config,
weather coordinates and GitHub token (the latter three were already present
in the supplied baseline; they were not reprinted).

Missing/empty locally:
SUPABASE_SERVICE_ROLE_KEY, QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, ZAPIER_WEBHOOK_URL.
HOMEWORKS_API_KEY is a legacy unused placeholder; direct OAuth does not need it.

Vercel connector verified baseline production READY, expected Git SHA,
Next.js framework, Node 24.x and production aliases. No runtime errors were
reported in the selected 24-hour window. Its exposed tools do not list
environment variables. No existing Vercel CLI login/project link was found
on NatesPC. Production env presence must be inspected through authenticated
Vercel access; local omissions are NOT claimed to be production omissions.

No fresh Homeworks or QuickBooks provider verification was performed this
session: the accessible checkout lacks its admin/provider config and no
authenticated Jarvis test session was available. Do not request Intuit
re-authorization just because local credentials are absent; a production
QuickBooks connection already exists.

## Owner-only prerequisites

1. Authorize the Vercel CLI on NatesPC when its login flow is requested.
   This permits a name-only production env audit and safe runtime checks
   without posting secret values to chat.
2. An authenticated Jarvis session is needed for fresh Homeworks and
   QuickBooks Verify/preview checks. Reauthorize a provider only if it
   actually rejects the stored refresh token.
3. Google Calendar needs a Google Cloud Web OAuth client, Calendar API
   enabled, server-side credentials and owner consent. Register exactly:
   https://jarvis-dashboard-fawn.vercel.app/api/integrations/google-calendar/oauth/callback
   Then choose the calendar. Existing Google/Intuit ChatGPT connectors do
   not automatically authorize the separately deployed Jarvis application.

## Verification

32 new isolated regression cases were added. They execute real production
modules with external auth/network boundaries replaced; no live business
data is written. Failing cases were observed before fixes.
The final combined integration/OAuth run passed 124 tests across Chromium and WebKit projects.
Typecheck, lint, production build and client-secret-reference check passed.
Full Playwright and final deployment results are recorded in JARVIS_PROGRESS.md.
