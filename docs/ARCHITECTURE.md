# Architecture — October 7, 2026

This describes the current working tree. **The ownership guard migration and corresponding application changes are pending production rollout.** [Current state](CURRENT_STATE.md) records that boundary; the [October 7 read-only audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md) records observed production behavior before the migration.

## Application layers

| Layer | Implementation and responsibility |
| --- | --- |
| Database | Supabase/Postgres, active-owner RLS, retained source records/projections; pending ownership triggers protect source fields and operational children |
| Reads | `src/lib/data/*`, shared domain types, calculation/formatting helpers |
| Human mutations | `src/lib/actions/*`, session client, ownership/parent guards, explicit native-field allowlists |
| UI | Dashboard routes and components; owned-record views show “Managed in Homeworks” guidance and expose native forms where implemented |
| AI | Read tools/proposal tools, advisor/provider, confirmation UI and a closed action executor |
| Ingestion | Existing scheduled Homeworks worker and transactional `homeworks_apply_page` |
| Source write-through | Existing `writeHomeworksSchedule`, followed by verified response projection |

AI reads reuse the dashboard data layer. Confirmed schedule/status changes reuse human action helpers. The executor also directly maintains explicitly native `action_requests`, `job_notes` and `owner_tasks`; it has no generic table-mutation tool. Activity logging is shared. The removed job-create/crew-assign executors and direct audit-note updater are not alternative surviving operational writers.

## Authentication and privilege

`src/proxy.ts` refreshes session cookies and redirects signed-out nonpublic page requests to login. API routes and Server Actions still require their own validation/authentication; a protected page is not their security boundary. `supabase/server.ts` creates the authenticated RLS-scoped client. `integrations/owner-auth.ts` verifies active owner membership for privileged integration operations.

`supabase/admin.ts` uses a server-only service-role credential for OAuth stores, automatic source projection and verified schedule write-through. Tokens are inaccessible to ordinary browser roles. The retired webhook and import endpoints authenticate legacy callers and then return 410; they no longer obtain an admin client.

Production had both permissive authenticated access policies and a restrictive active-owner policy at the October 7 audit. Owner RLS restricted who could write but did not restrict source-owned fields. Do not use `supabase/rls-policies.sql` alone as the current policy inventory. The new ownership triggers supplement RLS rather than replace it.

## Homeworks ingestion and schedule writes

Supabase `pg_cron` runs `jarvis-homeworks-sync` every five minutes. `pg_net` sends a secret-authenticated request to `/api/integrations/homeworks/scheduled`; `runAutomaticHomeworksSync` uses the service-only token path and distributed sync lease. It traverses 21 explicit source partitions, resumes keyset checkpoints, retries bounded transient failures, and records run/stream health. Browser polling reads status and refreshes rendering; it never ingests records.

`homeworks_apply_page` atomically retains each source payload, upserts native projections, maintains source-linked child rows, and saves the page cursor. Customers, properties, events, estimates, invoices, payments, catalog items and users project into clients, properties, jobs, quotes, invoices, payments, services and employees. Invoice/quote items and source crew are projected children. Source-only calendar events with no property stay in the source view rather than inventing a property/job.

The existing schedule flow checks owner access, reads a linked source visit, mutates Homeworks, validates returned date/time or status, and projects the confirmed event with the same sync lease. It never substitutes a local schedule mutation after source failure. Supported Homeworks statuses differ from the full local job enum; unsupported source statuses fail visibly.

The ownership changes preserve `homeworks-auto-worker`, `homeworks_apply_page`, `orderScheduleJobs`, the shared schedule reads, leases, OAuth coordination and route preference RPC. Historical projection migrations are left intact; the new guard migration uses explicit SQL rather than patching projector function text.

## Database ownership boundary

`homeworks_row_is_owned(text,jsonb)` recognizes source markers, retained projection identity, and protected client/property/invoice/quote/job ancestry. Parent rows are share-locked during the decision. `enforce_homeworks_ownership()` checks old and new rows, rejects source-marker spoofing/removal and source-owned insertion/deletion, and allows only explicit native field differences on protected updates.

The guards cover `clients`, `properties`, `jobs`, `quotes`, `invoices`, `payments`, `services`, `employees`, `invoice_items`, `quote_items`, `job_employees` and `service_agreements`. Source crew membership/line items and dependent foreign-key changes are inside the boundary, not just their top-level forms. New local jobs/payments cannot escape by omitting a source ID when their parent is owned. Independent local records retain local CRUD. The [field authority table](DATA_AUTHORITY.md#allowed-native-data-on-protected-rows) gives the exact exceptions.

Functions are `SECURITY INVOKER`; the actual service role is the trusted projection exception. Ordinary roles cannot enable it with request claims/session flags. Browser/public `TRUNCATE`, `TRIGGER` and `REFERENCES` privileges are removed from protected tables. Service credentials remain privileged; source verification is the responsibility of the two trusted application paths, not an arbitrary caller-supplied payload.

`src/lib/actions/homeworks-ownership.ts` provides session-scoped ownership reads, local-parent validation, source-field rejection and native-change checks. It performs no writes and is not a Server Action module. Source-owned and inherited-owned invoice/quote edit forms expose native notes only; `updateInvoice` and `updateQuote` validate all submitted business fields and reject source-field changes, then write only submitted notes. `src/lib/homeworks-ownership.ts` supplies marker/option checks for UI/data presentation; database pointer/lineage checks remain the final boundary for stale or incomplete UI metadata.

## AI proposals and confirmation

The advisor/provider loop exposes read tools plus named proposal tools. Proposals do not mutate; confirmation posts a structured action to `/api/ai-advisor/execute-action`. Both that route and `executeProposedAction` validate the closed action union before mutation:

| Action | Execution destination |
| --- | --- |
| `reschedule_job` | `updateJobFields`; source jobs use verified Homeworks schedule write-through |
| `update_job_status` | `updateJobStatus`; source jobs use supported Homeworks status write-through |
| `add_job_note` | Native `job_notes` |
| `create_task` | Native `owner_tasks` |
| `complete_task` | Native `owner_tasks` |

`create_job` and `assign_employee` are removed from action types, registered tools, executor and confirmation UI. Human local creation remains independently guarded. Existing stale-snapshot checks, action-request idempotency/fallback, result verification and activity history remain; no generic write tool is introduced.

## Native model and data trust

Jarvis-native tables include route preferences/stops, owner tasks, job notes/photos, equipment, expenses/time/material/support records, activity/action history and integration state. Source-projected tables may also carry the explicit native notes/hours/payroll fields. Source notes are always separate `homeworks_notes` values.

Field production dollars/hour, true paid dollars/hour, completed work, invoices, payments and receivables remain distinct. Rhode Island calendar periods, demo/deletion filters, visible source errors and honest missing-data states govern operational totals. Saved route preferences only order actual visits when source order is absent.

QuickBooks and Google Calendar OAuth/read adapters do not write Homeworks projections. Financial matching, calendar-to-job matching, route-level paid-hour profitability and employee-facing views remain separate future work. Automatic unattended Homeworks sync is already implemented and is not a future activation gate.

## Verification surfaces

[HOMEWORKS_WRITERS.md](HOMEWORKS_WRITERS.md) enumerates every relevant source/native/retired writer, including direct quote conversion and worksheet-photo paths. `scripts/test-homeworks-ownership.mjs` loads a schema-only production snapshot into isolated PGlite, applies the pending migration and runs rollback ownership plus existing sync/schedule SQL with synthetic fixtures. The separate production drift script uses a read-only transaction, reports identifiers/counts for discrepancies, and never repairs them. Test outcomes and production rollout must have explicit records; a schema snapshot or successful build is not deployment evidence.
