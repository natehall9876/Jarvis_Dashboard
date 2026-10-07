# Decisions — October 7, 2026

These decisions describe current code and the deployed ownership migration. [Current state](CURRENT_STATE.md) records production release evidence; [data authority](DATA_AUTHORITY.md) defines field ownership. The October 3 integration audit is historical and does not override the newer automatic-sync implementation or October 7 production evidence.

## Homeworks owns operational records; Jarvis owns explicit extensions

Homeworks-owned records are read-only projections inside Jarvis. Automatic projection and verified source-first schedule/status writes are the only surviving application paths that change their source-owned fields. Separate local imports, arbitrary webhook payloads and enrichment writers are retired even if they previously fetched source data: multiple transformation/writing paths can race or disagree.

Independent local records remain supported. They cannot create new jobs, billing records, payments or other operational children under source-owned parents. Existing protected records allow only intentional native fields, such as notes and actual hours. The database defaults new columns to protected instead of assuming unmapped fields are safe to edit.

## Enforce ownership in the database as well as the application

Hiding a button or guarding one action cannot protect direct authenticated REST calls, stale actions, child-table mutations, foreign-key cascades or concurrent parent linking. Migration `20261007030921_homeworks_ownership_guards.sql` checks source markers, retained projection identity and old/new parent lineage, with parent locks. It protects 12 tables and removes ordinary-role `TRUNCATE`, `TRIGGER` and `REFERENCES` privileges. Source identity cannot be forged or removed by normal callers.

The migration is additive enforcement, not data repair. It does not rewrite the existing projector and performs no business-row updates/deletes. It was applied in production as version `20261007030921`; the following scheduled run succeeded.

## Use a narrow trusted server-role boundary

Ordinary UI/AI data access uses the authenticated RLS-scoped client. The blanket historical “no service-role key anywhere” rule is obsolete. Server-only OAuth token storage, the unattended Homeworks worker and verified Homeworks schedule write-through legitimately use the admin client. Browser roles cannot read OAuth bearer tokens or execute source-projection/lease RPCs.

The guard trusts actual PostgreSQL `current_user = 'service_role'`, not a request-provided claim or custom session flag. That credential remains privileged and server-only. Retired webhook/import routes no longer instantiate it. No generic service-role business writer is added.

## Preserve the proven worker and schedule path

The five-minute worker, source stream coverage, leases, checkpointing and `homeworks_apply_page` remain the ingestion implementation. A real source response is projected after schedule/status write-through while holding the same lease. The ownership task does not add a second worker or a manual refresh/import trigger.

Homeworks route order wins when supplied; saved native route preferences order existing visits when source ordering is absent. Preferences never create visits or revenue. The shared schedule read path remains the basis for Schedule, mission and first-job selection.

## The model never gets a generic write tool

There is no `execute_mutation(table, filter, patch)` capability. The closed confirmed-action allowlist is `reschedule_job`, `update_job_status`, `add_job_note`, `create_task`, and `complete_task`. `create_job` and `assign_employee` proposals/execution are removed. A new source operation needs a verified source-first implementation, not a local-table shortcut.

`/api/ai-advisor` prepares proposals; `/api/ai-advisor/execute-action` handles explicit confirmation. Separate routes make the interaction clear but are not sufficient authorization by themselves: both the route and executor validate the allowlist, actions check the session/current state, and the database enforces ownership. Confirmation is not permission to bypass source authority.

## Keep native state and audit history separate

`job_notes`, `owner_tasks`, action requests, activity history and integration health remain Jarvis-native. The AI executor writes those explicit tables where needed; it does not provide a separate generic CRM writer. Native `notes` fields and source `homeworks_notes` are distinct.

`activity_log` remains best-effort. Existing `action_requests` persistence/idempotency and its in-process fallback are preserved; their limitations do not justify weakening source checks. A missing or incomplete activity trail cannot establish who last changed a projected field or prove that local edits never occurred.

## Measure drift without repairing it

Production diagnostics run read-only and compare against the actual deployed projector. The October 7 audit found no current retained-source drift but also found missing ownership enforcement. Zero drift is neither proof of historical write safety nor independent proof that the source cache contains the latest provider state. No repair is bundled into this task.

Database mutation regressions use synthetic fixtures in isolated PostgreSQL and roll back. A schema-only production catalog snapshot provides realistic constraints/RLS/functions without copying business rows. Test results and production deployment are recorded separately.

## Preserve business and interaction distinctions

Field production dollars/hour and true paid dollars/hour remain separate measures; job revenue, invoiced value and cash collected remain separate lifecycles. A void invoice is not outstanding receivable. Missing data does not become a successful zero-dollar report.

Mock data is isolated to `src/mock/` and must not supply production data. Voice transcripts reuse the same submission/proposal/confirmation flow as typed requests; there is no separate voice mutation authority.
