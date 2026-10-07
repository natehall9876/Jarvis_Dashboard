# Homeworks projection writer inventory — October 7, 2026

Scope: all production code in `src`, plus SQL and scripts in `supabase` and `scripts`, starting from production baseline `3466b8a` and updated for this working tree. **Application deployment and migration `20261007023608_homeworks_ownership_guards.sql` are pending.** Production still had the legacy enforcement gap at the [read-only audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md).

**Homeworks-owned records are read-only projections inside Jarvis.** Only automatic source projection and verified Homeworks write-through may change their source-owned fields. A writer can remain **LEGITIMATE for Jarvis-native data** while being **BLOCKED for source-owned data**. Independent local records are not another authority for an existing source record or its operational children.

## Trusted source writers — LEGITIMATE

| Entry point and call chain | Projection writes and trust boundary |
| --- | --- |
| `scripts/configure-homeworks-scheduler.sql` → `src/app/api/integrations/homeworks/scheduled/route.ts::POST` → `src/lib/integrations/homeworks-auto-worker.ts::runAutomaticHomeworksSync` → `homeworks-auto-core.ts::processStream` → `homeworks_apply_page` | Scheduled route checks `HOMEWORKS_SYNC_SECRET`. Worker uses the server-only service role, obtains source OAuth authorization and the distributed sync lease, reads real source streams and atomically applies each page/checkpoint. It also writes native sync-run/state tables. |
| `src/lib/integrations/homeworks-schedule-write.ts::writeHomeworksSchedule` → `requireIntegrationOwner` → source visit read → `scheduleEvent` or `updateEventStatus` → verified returned event → `homeworks_apply_page` | Owner-authorized source-first date/time or supported status changes. Uses the same sync lease and service-role projection as the worker. No local source-field fallback after failure. |
| `src/lib/actions/jobs.ts::updateJobFields` / `updateJobStatus` → `writeHomeworksSchedule` | Source-owned date/time/status requests from human actions or confirmed AI actions reach the verified write-through above. An owned job without a linked source visit ID is rejected. Native overlays are handled separately. |

The original `homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)` is in `supabase/migrations/20261006150035_homeworks_automatic_sync.sql`. Its complete production mapping is:

| Source entity | Writes |
| --- | --- |
| `customers` | `clients` upsert |
| `properties` | `properties` upsert, resolving source customer |
| `items` | Exact/unambiguous existing `services.homeworks_id` linking update; services upsert |
| `users` | Exact/unambiguous existing employee email linking update; employees upsert |
| `events` | `jobs` upsert; source crew assignment insert/delete in `job_employees`; source route order update |
| `estimates` | `quotes` upsert; `quote_items` upsert and removal of missing source lines |
| `invoices` | `invoices` upsert; `invoice_items` upsert and removal of missing source lines |
| `payments` | `payments` upsert, including deletion/refund mapping and source invoice/customer linkage |

Every page also writes retained `homeworks_records` and `homeworks_sync_state`. The projection-repair migration `20261006182957_homeworks_projection_repair.sql` adds line-item projection and repeated-payload drift repair; `20261006184253_homeworks_due_date_calendar.sql` adjusts invoice calendar dates; `20261006212449_schedule_source_authority.sql` adds source `jobs.stop_order`. Those historical migrations used dynamic function-definition replacement; the ownership migration does not repeat that technique or modify the projector.

Projection and lease RPCs are `SECURITY INVOKER`, callable by `service_role` rather than ordinary `anon`/`authenticated` callers. The actual trusted role can write protected tables: this is a server-credential boundary, not proof that any arbitrary service-role payload came from Homeworks. Keep the credential confined to these verified source paths and nonbusiness token/state stores.

## Session writers — LEGITIMATE only within native ownership

All paths below use `createSupabaseServerClient`, not an admin client. The action layer rejects source ownership before divergent writes. The pending database guard is the final boundary for direct REST, stale state, source-pointer-only ownership, child operations and races.

| File and exact functions | Tables written; ownership classification |
| --- | --- |
| `src/lib/actions/clients.ts::createClient` | Inserts independent native clients; rejects supplied source identity fields. **BLOCK** creation of a source projection. |
| `clients.ts::updateClient`, `archiveClient` | Client update/archive. **LEGITIMATE** independent local changes and source-client native notes through the allowed update branch; **BLOCK** source identity/contact/status/provenance edits and source archive. |
| `src/lib/actions/properties.ts::createProperty`, `updateProperty`, `archiveProperty` | Property insert/update/archive. Requires a local client for independent creation; permits access/service notes on owned properties. **BLOCK** source address/identity/activity/parent changes and source archive. |
| `src/lib/actions/employees.ts::createEmployee`, `updateEmployee`, `archiveEmployee` | Employee insert/update/archive. Source identity/contact/activity protected; native role, hourly rate, driver's-license flag, hire date and notes permitted on protected employees. |
| `src/lib/actions/jobs.ts::insertJob` | Inserts jobs after local-property/lineage checks and rejects source fields, then calls `syncJobCrew`. **BLOCK** local job creation under a source property/client, even with no source ID on the job. |
| `jobs.ts::syncJobCrew` | Deletes/reinserts `job_employees` for an independent local job. **BLOCK** source crew membership changes. Native `hours_worked` on an existing protected assignment is a database allowance, not permission to replace the assignment. |
| `jobs.ts::updateJobFields`, `updateJobStatus` | Local job update/crew changes remain native. Source job schedule/status takes verified write-through; only `notes`, `completion_notes`, `actual_hours` may update locally. **BLOCK** source price/service/property/budget/crew changes and invalid owned-job linkage. |
| `jobs.ts::createJob`, `updateJob`, `changeJobStatus` | Public form/status Server Action entry points into the guarded helpers above. Guard the helpers as well as the forms. |
| `src/lib/actions/photos.ts::createJobFromWorkSheet` → `insertJob` | Converts reviewed worksheet extraction into a completed native job, then updates `job_photos.job_id`. Same local-property/lineage gate as manual creation; **BLOCK** creation against a Homeworks property. Extraction alone does not write a job. |
| `src/lib/actions/quotes.ts::createQuote` | Inserts a native draft quote only with verified local client/property parents. |
| `quotes.ts::updateQuote`, `deleteDraftQuote`, `sendQuote`, `acceptQuote`, `declineQuote` | Quote update/delete/status timestamps: **LEGITIMATE** local records and native `notes` through the notes-only owned-quote form/action branch; **BLOCK** source operational fields and deletion. `updateQuote` checks all submitted business fields, including forged fields, and writes only submitted notes for source/inherited ownership. |
| `quotes.ts::addQuoteItem`, `removeQuoteItem` → private `recomputeQuoteTotal` | Quote-item insert/delete and quote subtotal/tax/total update only for local quotes. Item removal checks/scopes both `quote_id` and item ID. **BLOCK** source lines, totals or cross-parent deletion. |
| `quotes.ts::convertQuoteToInvoice` | Direct inserts into `invoices` and `invoice_items`; verifies local quote and local client/property parents. Does not go through invoice creation helpers, so requires its own guard. **BLOCK** conversion of source quotes or creation under source parents. |
| `quotes.ts::convertQuoteToJob` | Direct jobs insert; verifies local quote and local parents. Does not call `insertJob`, so requires its own guard. **BLOCK** source-quote conversion/local jobs under source properties. |
| `src/lib/actions/invoices.ts::createInvoice` | Inserts a native draft invoice only with verified local client/property parents. |
| `invoices.ts::updateInvoice`, `deleteDraftInvoice`, `voidInvoice`, `sendInvoice` | Invoice update/delete/status timestamps: **LEGITIMATE** local records and native `notes` through the notes-only owned-invoice form/action branch; **BLOCK** source operational fields/deletion. `updateInvoice` checks all submitted business fields, including forged fields, and writes only submitted notes for source/inherited ownership. |
| `invoices.ts::addInvoiceItem`, `removeInvoiceItem` → private `recomputeInvoiceTotal` | Invoice-item insert/delete and invoice subtotal/tax/total update only for local invoices. Removal checks/scopes both `invoice_id` and item ID. **BLOCK** source lines/totals and cross-parent deletion. |
| `invoices.ts::recordPayment` | Native payment insert and corresponding local invoice paid amount/status update. Verifies invoice ownership and actual client relationship before writes. **BLOCK** source invoices/clients and forged mismatched client/invoice combinations. |

`src/lib/actions/homeworks-ownership.ts::{getOwnershipRecord,isRecordHomeworksOwned,requireLocalRecord,requireLocalFinancialParents,rejectOwnershipFields,submittedFields,requireNativeChanges}` are shared checks, not writers or public Server Actions. Their dynamic `db.from(table)` query is read-only. `src/lib/homeworks-ownership.ts::{isHomeworksOwned,isHomeworksOptionOwned}` carries source markers into presentation and creation options; UI metadata never substitutes for database enforcement.

## AI entry points

`src/app/api/ai-advisor/execute-action/route.ts::POST` validates the action and calls `src/lib/ai/actions/execute.ts::executeProposedAction`. The executor validates the allowlist again before action-request mutation, checks the session, handles stale/idempotency state and dispatches:

| Executor function | Destination and classification |
| --- | --- |
| `executeRescheduleJob` | `updateJobFields`; verified source write-through for owned visits or native local-job edit. **LEGITIMATE** within that boundary. |
| `executeUpdateJobStatus` | `updateJobStatus`; same distinction and supported-source-status restrictions. |
| `executeAddJobNote` | Native `job_notes`; does not edit projected job details. |
| `executeCreateTask`, `executeCompleteTask` | Native `owner_tasks`. |
| `claimActionRequest`, `finalizeActionRequest` | Native `action_requests` state; no projected-table mutation. |

`executeCreateJob`, `executeAssignEmployee`, `appendJobAuditNote`, `propose_create_job`, and `propose_assign_employee` are **REMOVED**. The remaining allowlist is `reschedule_job`, `update_job_status`, `add_job_note`, `create_task`, `complete_task`. Forged or stale references to removed action types are rejected. Proposal tools only read/build proposals; they never write. Human native job creation and guarded worksheet conversion remain separate legitimate workflows.

## Retired Homeworks writers — REMOVE / BLOCK

These were competing write paths on baseline `3466b8a`, even when they read live source data. Their mutation bodies are removed; compatibility entry points return a documented retired error. Removing UI affordances alone would not be sufficient.

| Exact path/function | Former writes and current disposition |
| --- | --- |
| `src/lib/integrations/homeworks-sync.ts::syncHomeworksEntity` | Former client/property/invoice/job upsert sink. Now no-I/O error result for every caller/origin. The unused dry-run database helper is removed; pure legacy payload inspection helpers remain. |
| `src/app/api/integrations/homeworks/webhook/route.ts::POST` | Former service-role single-record upsert from a caller-mapped payload. Retains missing-secret 503/wrong-secret 401, then 410. No admin client, business reads/writes, failure-log writes or new sync trigger. |
| `src/app/api/integrations/homeworks/import/route.ts::POST` | Former service-role customer/property/invoice export-batch upsert, including dry-run requests. Same secret checks, then 410 with no payload import. |
| `src/app/api/integrations/homeworks/admin-import/route.ts::POST` | Former session-scoped batch import. Session check, then 410; no business-record reads/writes. |
| `src/lib/actions/homeworks-import.ts::confirmHomeworksImport` | Former customer/property direct-API import into legacy sink. Returns unavailable before source/database access. |
| `src/lib/actions/homeworks-job-sync.ts::confirmHomeworksJobImport` | Former OPEN-event jobs import into legacy sink. Returns unavailable before source/database access. |
| `src/lib/actions/homeworks-link.ts::confirmHomeworksLinks` and former nested `linkProperties` | Former client/property source-ID linking and blank contact/address/provenance updates. Writer body removed; confirm returns unavailable. |
| `src/lib/actions/homeworks-enrich.ts::confirmHomeworksEnrichment` | Former services inserts and job service/budget/start-time fills. Writer body removed; confirm returns unavailable. |
| `src/lib/actions/homeworks-historical.ts::confirmHistoricalSync` | Former services inserts and completed-job inserts. Writer body removed; confirm returns unavailable. |

Former affordances were in `components/settings/homeworks-connection-card.tsx`, `homeworks-import-form.tsx`, `homeworks-link-panel.tsx`, `homeworks-enrich-panel.tsx` and `homeworks-historical-panel.tsx`, including `/settings/homeworks-import`. Their server blocks remain independently necessary for stale callers.

`previewHomeworksSync`, `previewHomeworksJobSync`, `previewHomeworksLinking`, `previewHomeworksEnrichment`, `previewHistoricalSync`, `reconcileHomeworksDay`, and `reconcileHomeworksRange` are read-only comparisons, not surviving projection writers. The pure linking/enrichment/historical planners do not mutate.

## Database, generic and dormant surfaces

| Surface | Classification and treatment |
| --- | --- |
| Ordinary authenticated direct REST/SQL against the 12 protected relations | **BLOCK** source operational mutations at the trigger boundary after migration; **LEGITIMATE** explicit native overlays/independent local records under existing owner RLS. Current production protection is pending. |
| `supabase/migrations/20261007023608_homeworks_ownership_guards.sql::{homeworks_row_is_owned,enforce_homeworks_ownership}` | Explicit ownership checks and guard, not a projection writer. Dynamic SQL installs triggers/revokes dangerous ordinary-role privileges. It does not copy/repair business data. |
| Source markers, retained projection pointers, old/new parent lineage | Cover ID-clearing/spoofing, local children under source parents, moves between parents and retained source identity after marker drift. Parent locks prevent concurrent source-linking races. |
| Cascading/set-null foreign keys | Source child triggers also guard service deletion clearing source job/item service links, employee deletion cascading source crew, and property/invoice/quote/service-agreement cascades. Do not assume guarding the parent form alone covers these writes. |
| `supabase/rls-policies.sql` dynamic policy loop | Historical broad authenticated policies; not a business DML writer and not the full live policy set. October 7 live RLS also included restrictive active-owner checks, but no field ownership boundary. Do not replay this file as current ownership enforcement. |
| `service_agreements` | No production JS mutation function found. Protected through property lineage and database guard; existing native notes allowed. A source service reference alone is not ownership propagation in this migration. |
| `services` | No ordinary service CRUD module found. Source service writes are the legitimate projector; legacy enrich/historical inserts are retired. Independent local services remain native under database/RLS rules. |
| `src/lib/data/operations.ts::allRows` and shared ownership `db.from(table)` | Dynamic table names are read-only. No generic dynamic JavaScript table mutation writer found. |
| `supabase/demo-data-classification-migration.sql` | Dormant manually run updates to clients.data_source based on source IDs or historical demo phone values. Not an active app writer or authorized source repair; do not replay to change source ownership. |
| `scripts/homeworks-sync-regression.sql`, `scripts/schedule-authority-regression.sql`, `scripts/homeworks-ownership-regression.sql` | Synthetic/rollback test writers only. Run in the isolated test database, not production. They include direct fixture mutations and projection RPC calls intentionally needed to test the boundary. |
| `scripts/fixtures/homeworks-production-schema-20261007.sql` | Schema/function/policy snapshot captured read-only; no production business rows. Test-only setup, not a migration to deploy. |
| `scripts/homeworks-production-drift-audit.sql` | Repeatable-read read-only diagnostic. No DDL/DML, explicit row locks, mutation fixtures, projection invocation or repairs. |
| `save_route_stop_order` / `src/lib/data/routes.ts::updateRouteStopOrder` | Native `route_stops.stop_order` only, outside projected tables; owner check plus complete/stale membership validation. Existing source-order precedence remains. |
| `set_updated_at()` | Existing timestamp trigger updates `NEW.updated_at` only; not an alternate source-field writer. |

OAuth connection modules for Homeworks, QuickBooks and Google Calendar use service-role access only for protected token/connection storage. QuickBooks customer/invoice/payment adapters and Google Calendar event adapters read external data; neither writes these projections. No separate export/reconciliation writer was found beyond the retired export-ingestion paths above. Activity/failure logging, photo storage, notes/tasks and equipment/expense/route helpers are separate native destinations; `createJobFromWorkSheet` is the relevant photo-to-projection bridge and is listed explicitly.

## Verification and production limits

`npm run test:ownership:db` invokes `scripts/test-homeworks-ownership.mjs`: create isolated in-memory PGlite, load the schema-only production snapshot, apply the new guard migration, execute rollback ownership tests with synthetic owner/source/local fixtures, check no ownership fixtures remain, then run existing sync/schedule SQL using synthetic source records. The ownership regression verifies actual denied mutation errors (not invisible RLS zero-row updates), permitted native changes, dangerous-role privilege removal and real service-role projection through `homeworks_apply_page`. `--baseline` skips the guard to demonstrate the original enforcement gap. Record results separately; merely providing the harness is not a pass claim.

The production audit at 2026-10-07 02:38:01–02:42:56 UTC found zero current source-field/child/pointer/reference/route/crew drift, zero local operational children on source parents, 373 top-level projections and 103 source line items. Eight historical enrichment log entries do not establish current drift or updater identity. Production had no ownership triggers at that snapshot. See the [full sourced report](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md) for exact counts, runtime function fingerprints and caveats. No production repair or mutation regression was run.

Deployment and migration are separate pending steps. After rollout, verify the actual installed guards/grants, a normal scheduled run and the relevant authenticated UI/source-write-through behavior. A clean retained-source comparison, a local PostgreSQL pass and a build each establish different facts; none alone proves the production boundary is installed.
