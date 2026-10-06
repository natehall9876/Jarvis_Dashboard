# Homeworks automatic production synchronization

## Root cause
The previous integration had working OAuth/API reads, owner-invoked imports/reconciliation, and a webhook receiver. It had no production scheduled worker and no verified Homeworks event subscription delivering the required object coverage. A successful connection/API check therefore did not advance operational data. At diagnosis, production contained 48 linked jobs last updated September 25 and no linked Homeworks invoices.

## Production flow
Homeworks GraphQL -> Supabase pg_cron every five minutes -> pg_net POST to the Vercel scheduled route -> service-only OAuth worker -> transactional source mirror and native projections -> production server-rendered UI. The browser only checks status every 20 seconds and refreshes displayed data; it never performs ingestion.

The named cron job is jarvis-homeworks-sync, schedule */5 * * * *. Each timestamp-capable stream uses updatedAt with a five-minute overlap and id keyset pagination. Every stream receives a full scan at least daily. Properties, items and users are scanned each run because their filter schema does not support the same incremental timestamp. 21 explicit archive/deletion partitions avoid provider default filters hiding records.

The existing webhook endpoint remains available, but automatic operation does not depend on it. No sufficient native webhook subscription interface was found in the live Homeworks GraphQL schema used by this connection.

## Data coverage
- Customers: source ID, name, email, both phone fields, contact address, status, notes and deletion state.
- Properties: customer relationship, service address, activity/deletion state and notes.
- Events/work: property/customer relationships, schedule dates and local start time, status, service line items, prices, budgeted hours, recurrence ID, crew/users and dispatch notes.
- Estimates: amounts, lines, status, notes/internal notes, acceptance timestamp and archive/deletion state.
- Invoices: amounts, lines, paid amount, exact source payment status, dates, notes/internal notes and archive/deletion state.
- Payments: invoice/customer links, date, totals, method, refund flag and notes.
- Service catalog/items and assignment users.

Native clients, properties, jobs, quotes, invoices, payments, services, employees and source-linked line items are updated by stable Homeworks IDs. The /homeworks view displays exact source fields that have no native counterpart. Owner-authored Jarvis notes remain separate from homeworks_notes. Confirmed demo clients and dependent rows are filtered out of production lists and existing business summaries.

At initial reconciliation: 71 customer records (25 current plus 46 source-deleted), 26 properties, 230 events, 2 estimates, 26 invoices, 7 payments, 6 items and 2 users. Source-deleted records remain visible as history, not duplicate active customers. Invoice and quote projections contain 101 and 2 source line items respectively.

## Limits and mapping decisions
Only fields returned by the verified live schema are synchronized. Source descriptions can contain HTML; the UI renders them as inert text. Source event dates/times and invoice calendar due dates are preserved. Homeworks computes invoice due dates from date-only late-fee terms and encodes them at midnight UTC; converting to New York would incorrectly subtract one day. Actual timestamp display uses America/New_York.
Property-less source calendar events stay visible in /homeworks; a native job property is not fabricated. Full source statuses remain available even where native Jarvis status enums are coarser. Actual work duration, costs, route ordering, attachments/photos and unsupported custom fields are not invented. A hard-deleted object absent from every provider query cannot be proven deleted; history is retained. Soft-deleted/archive partitions are explicitly reconciled. More than 999 nested users/line items fails visibly rather than truncating silently.

## Reliability and operations
- Single distributed sync lease; duplicate scheduler calls return busy.
- Distributed OAuth refresh lease and existing reconnect compare-and-swap persistence.
- Atomic page projection and checkpoint; failed pages never advance success state.
- Resume keyset cursor after interruption. Worker yields before its duration budget.
- Up to three retries on network/429/5xx, exponential delay with bounded Retry-After.
- Remaining failures retry on the next five-minute schedule. Authorization revocation requires reconnect and is surfaced as a failure, not an empty success.
- homeworks_sync_runs records run IDs/status/errors/counts. homeworks_sync_state tracks per-stream checkpoints/errors/failure counts. Interrupted workers are marked on the next run.
- Daily reconciliation reapplies native projections even when source payload is unchanged.
- Secret route authenticates using HOMEWORKS_SYNC_SECRET; an invalid secret was verified to return 401.
- HOMEWORKS_SYNC_SECRET is a sensitive Vercel production variable. Matching scheduler secret is stored in Supabase Vault. Neither secret nor OAuth tokens are client-side or committed.
- RLS permits active owner reads of sync status/source data. Sync and lease RPCs are service-role only.
- The status revision includes both source changes and run status, so open dashboards also show new successful/no-change/failed runs.

Apply migrations before deploying the worker. Configure matching secrets, then run scripts/configure-homeworks-scheduler.sql (named/idempotent schedule). Investigate latest sync_runs and failed sync_state rows first. Do not manually advance checkpoints after a failure. To stop ingestion reversibly, set the named cron job inactive; restore it after resolving the issue. Reconnect Homeworks through Settings if authorization is revoked.

## Verification
Typecheck, production build, client-secret scan and focused sync/OAuth/data tests passed. Database rollback tests cover create/update replay, stable IDs, explicit blank clearing, owner-note preservation, repair of native drift, page/checkpoint rollback, RPC privileges, source line mapping/removal and unchanged source revision.

The broader 750-case browser run had 748 passes and two mobile voice timing failures. Both failures passed in an isolated rerun; no unrelated voice code was changed.

## Live acceptance evidence
Existing Homeworks customer 2955966, Jarvis Integration Test, had a blank description (baseline source updatedAt 2026-09-22T17:54:08Z).
A description-only mutation saved "Jarvis automatic sync acceptance 2026-10-06 — temporary reversible test" at 2026-10-06T18:30:27Z (2:30:27 PM ET).
The ordinary scheduled run 53a1f17a-7f52-4054-8bc4-3a2cb700b069 applied exactly one changed record at 18:35:02.602066Z and completed successfully at 18:35:12.099Z.
The source mirror and native clients.homeworks_notes both held the exact marker. The production /homeworks?entity=customers page was left open from before the mutation and displayed the marker automatically. No manual import, explicit sync call, navigation or browser reload was used.
The description was restored to its original blank value at 18:36:01Z. Revert confirmation is recorded below after the next scheduled run.

Revert passed: scheduled run b775f326-10a5-4be5-928b-c96f04de332f restored both the source mirror and native note at 2026-10-06T18:40:02.278531Z and completed at 18:40:07.690Z with one changed record. The same untouched production page automatically removed the marker. Customer/source record counts remained stable; no manual sync/import was invoked. OAuth metadata also confirms server-side refresh at 17:50:01.715Z during scheduled operation.

Final combined-source validation: typecheck, production build and client-secret scan passed; 176 targeted sync/OAuth/schedule/data/operations cases passed across Chromium and mobile Safari. Later production changes already on main were fast-forwarded and preserved before this validation.
