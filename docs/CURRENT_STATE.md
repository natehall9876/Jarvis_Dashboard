# Current state — October 7, 2026

Production: https://jarvis-dashboard-fawn.vercel.app. Vercel deploys `origin/main`; release SHAs and deployment evidence belong in `JARVIS_PROGRESS.md`.

**The Homeworks ownership boundary is live.** Application commit `b7368ac` reached production READY; migration `20261007030921_homeworks_ownership_guards.sql` was applied at 03:09:21 UTC. Read-only verification found all 12 guards enabled, RLS retained, dangerous ordinary-role privileges removed, and exact tested guard fingerprints. The 03:10 scheduled run succeeded across all 21 streams with no errors. See [acceptance and release evidence](HOMEWORKS_OWNERSHIP_ACCEPTANCE_2026-10-07.md).

## Existing production behavior

Jarvis is an owner dashboard built with Next.js 16, React, Supabase Auth/Postgres and Vercel. Homeworks is the operational source; Supabase holds its retained source records and native projections. QuickBooks and Google Calendar have separate OAuth/read adapters.

Automatic Homeworks synchronization is already running. Supabase `pg_cron` invokes the secret-protected scheduled route every five minutes through `pg_net`. The server worker coordinates source/OAuth leases, reads 21 archive/deletion streams, applies transactional pages through `homeworks_apply_page`, and records checkpoints/runs/errors. Browser refresh only refreshes displayed data. The earlier October 3 statement that no unattended worker existed is historical and has been superseded.

Linked Homeworks visit date/time and supported status changes already use verified source-first write-through. Schedule reads and route preferences preserve the existing source-order-first behavior described in [data authority](DATA_AUTHORITY.md). This task does not redesign the worker, projector, schedule ordering, or propose/confirm architecture.

## Enforced ownership

Homeworks-owned operational data is treated as a read-only projection. Source markers, retained projection pointers and operational parent lineage determine ownership. Independent local records and intentional native overlays remain valid Jarvis workflows.

The new database guard covers clients, properties, jobs, quotes, invoices, payments, services, employees, invoice/quote items, job employees, and service agreements. It checks old and new ownership, prevents source-ID spoofing/removal, blocks local children on source-owned parents, and permits only explicit native fields on protected rows. The actual database service role remains trusted for automatic projection and verified write-through; ordinary authentication alone is insufficient. RLS remains enabled and browser-role truncate/trigger/reference privileges are removed. The migration does not repair or delete business data.

Server actions enforce the same distinction and source-owned UI controls show “Managed in Homeworks.” Explicit native notes/hours/payroll fields and independent local records remain permitted. Source-owned and inherited-owned invoices/quotes expose notes-only editing; their update actions reject changed source fields, including forged submissions, and write only submitted native notes. Child-item mutation must be scoped by both parent and child ID. Worksheet-photo job creation uses the guarded local-job helper; quote-to-job and quote-to-invoice conversions must verify their own local source/parent relationships.

Legacy manual imports, linking, enrichment, historical sync and the `syncHomeworksEntity` sink now fail closed before reads/writes. Old webhook and exported-file import endpoints return 410 after their existing secret check; the owner import endpoint returns 410 after session verification. Their disabled controls do not create a replacement manual sync trigger. Read-only previews/reconciliation remain separate from ingestion.

The confirmed AI allowlist now contains five actions: `reschedule_job`, `update_job_status`, `add_job_note`, `create_task`, `complete_task`. Job creation and employee assignment proposals/executors are removed. Schedule/status actions use the same protected action helpers as the UI; notes/tasks remain native. The execution route and executor both reject retired action types before mutation. Confirmation, stale checks and `action_requests` remain in place.

See [the complete writer inventory](HOMEWORKS_WRITERS.md) for every surviving/retired path and allowed native fields in [data authority](DATA_AUTHORITY.md).

## Production read-only evidence

The [October 7 production audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md), observed at 02:38:01–02:42:56 UTC, found:

- Zero local payments on source invoices/clients, local jobs on source properties, local source-parent billing/properties, or local source-parent line items/service agreements.
- Zero source-field, line-item, projection-pointer, source-reference, route-order or crew mismatches against retained payloads.
- 373 top-level projections: 71 clients, 26 properties, 233 jobs, 2 quotes, 26 invoices, 7 payments, 6 services and 2 employees; 103 source line items.
- Eight historical owner-labelled enrichment events. Their current projected fields match retained source; the log is not evidence of current drift or a complete row-change history.
- All 21 streams healthy at the structural snapshot, and 136 successful runs with no other run statuses in the preceding 24-hour window.
- Active-owner RLS existed, but no ownership triggers existed. Owners could still independently mutate source fields; protection was a real gap despite zero observed drift.

No production DDL/DML, fixture tests, source mutations or repairs were performed for that audit. Counts compare the retained source cache with its projections, not an independent fresh Homeworks fetch. The October 3 audit is retained as historical evidence, not current sync counts or activation guidance.

## Validation and release boundary

`scripts/test-homeworks-ownership.mjs` runs real PostgreSQL semantics in an isolated PGlite database using a schema-only snapshot captured read-only from production. It applies the ownership migration, runs rollback-only ownership fixtures, checks fixture rollback, and exercises the existing sync/schedule regression SQL using synthetic source records. `npm run test:ownership:db` is the standard entry point; `--baseline` skips the guard migration to show that the old schema fails the ownership assertion.

`scripts/homeworks-production-drift-audit.sql` is a separate repeatable-read, read-only diagnostic and performs no mutation tests. Do not run the ownership regression against production.

The [acceptance report](HOMEWORKS_OWNERSHIP_ACCEPTANCE_2026-10-07.md) records actual typecheck, lint, build, isolated database, application/browser results and production rollout evidence. The ownership checks passed. Two unchanged baseline lint findings and a reproduced pre-existing mobile voice timeout remain explicitly identified; the full repository suite is not claimed all-green.

Remaining product work includes QuickBooks financial matching, calendar-to-job matching, route-level paid-hour profitability and employee-facing views. Source completeness and missing demand/capacity must be reported honestly rather than filled with fabricated records.
