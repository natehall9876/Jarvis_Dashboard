# Current state — October 3, 2026

Canonical repo: C:\Users\nateh\OneDrive\Documents\Jarvis_Dashboard.
Production: https://jarvis-dashboard-fawn.vercel.app.
Vercel deploys origin/main automatically. Exact release SHAs and test/deployment
results are recorded in JARVIS_PROGRESS.md. The timestamped
[Integration audit](INTEGRATION_AUDIT_2026-10-03.md) separates database evidence
from actual provider verification.

## Completed

Jarvis is an owner dashboard on Next.js 16, React, Supabase Auth/Postgres and
Vercel. Homeworks remains the customer/property/job system; QuickBooks is
accounting; Google Calendar is a separate read-only event preview. The AI
advisor reads through the same data layer as the dashboard. Its four job
write operations require explicit confirmation and reject stale/repeated actions.

Homeworks direct OAuth/GraphQL, customer/property import, date-range job import,
linking, enrichment, historical backfill, reconciliation and inbound webhook
handling are implemented. Partial deliveries preserve omitted fields.
Malformed source totals/timing flags are rejected before import. Existing job
notes and inactive properties are preserved; duplicate phone/email matches in
one batch are blocked. Partial property failures are reported as errors.

All three OAuth stores preserve existing authorization if reconnect fails,
check refresh persistence, coalesce refreshes within one process and use
updated_at comparisons to prevent an in-flight refresh overwriting a reconnect.
Privileged OAuth access requires an active owner membership, matching live
business-table RLS. Invalid grants require reconnect; database/network failures
do not masquerade as disconnection. Disconnect reports persistence failure.

QuickBooks and Google status distinguish saved authorization from an actual
successful API read. QuickBooks refresh expiry is shown separately. Google
calendar selection is bound to the authorization version used to list calendars,
so a stale tab cannot select an old account's calendar after reconnect.
Provider reads validate response shapes, bound pagination, deduplicate records,
use timeouts and suppress raw error bodies.

Business totals use Rhode Island calendar dates. Weekly revenue spans month
boundaries correctly; monthly cash/hours exclude future dates; demo payments,
skipped projected jobs and draft overdue invoices are excluded. Failed reads
cannot silently produce successful zero-dollar totals. Today's Mission retains
jobs while identifying unavailable supporting sections. Attention/AI summaries
exclude confirmed demo records and report incomplete source data.

## Verified live

Supabase direct read-only inspection succeeded. OAuth stores, owner membership,
restrictive owner policies, business tables, Homeworks unique ID indexes,
activity/failure history and the private photo bucket exist. The active owner
membership and its SELECT policy were checked, not assumed. No migration or
customer-data write was performed during this audit.

The last audit found 25 linked clients, 26 linked properties and 48 linked jobs.
Most recent job changes were September 25; linked future jobs extended to
October 12. Homeworks and QuickBooks each have one saved authorization;
Google has none. These counts and stored tokens do not prove current API access.

Deployment health, expected Git SHA and unauthenticated route protection can
be verified through connected Vercel tools without CLI authorization. See the
release log for the latest verified READY commit.

## Implemented but not freshly verified live

Homeworks and QuickBooks API access, token refresh against the real providers,
and authenticated owner workflows need a signed-in Jarvis session/configuration
check. Google code has isolated regression coverage but no owner authorization.
Tests use synthetic records and mocked external boundaries; they do not establish
that production credentials work.

Homeworks legacy webhook-labeled activity was also produced by manual imports.
Only explicit origin=webhook and provenance_version=2 qualifies as new delivery
evidence. An unreadable history reports unknown, not Never/no failures.

## Blocked by owner action

Vercel CLI authorization is pending. Do not restart/repeatedly retry its login.
After authorization, inspect production environment variable NAMES/presence,
not values. Local omissions do not establish production omissions.

Local missing configuration: SUPABASE_SERVICE_ROLE_KEY, QUICKBOOKS_CLIENT_ID,
QUICKBOOKS_CLIENT_SECRET, GOOGLE_CALENDAR_CLIENT_ID,
GOOGLE_CALENDAR_CLIENT_SECRET and ZAPIER_WEBHOOK_URL.
A QuickBooks authorization already exists: do not reconnect Intuit unless a
live check actually requires it. Google needs its existing/new Web OAuth client
configuration and one owner consent; the exact callback is documented in Settings.

## Future improvement / activation gates

No scheduler or unattended Homeworks write loop is enabled. Current direct API
calls require an active owner session. Before unattended execution, establish
distributed refresh coordination, verify fresh source data and external webhook
coverage, and choose conflict rules for owner-edited jobs, cancellations,
reschedules and deletions. The current shared upsert API has no source-version
ordering, so delayed deliveries can still overwrite newer explicit fields.
Enabling a timer over that path would risk business data.

QuickBooks financial matching, calendar-to-job merging, route-level profit and
employee-facing views are future work. No new platform or subscription is needed
for the completed work. No fall-cleanup demand or crew capacity is invented when
the underlying records do not establish it.
