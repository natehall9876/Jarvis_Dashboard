You are taking ownership of the next critical reliability task in my Jarvis dashboard.

Work directly in the existing Jarvis repository and make maximum safe progress without repeatedly asking me what to do.

## PRIMARY OBJECTIVE

Make Homeworks the enforced source of truth for all Homeworks-owned operational data.

Jarvis/Supabase must NOT behave like a second writable CRM.

The problem to eliminate is:

- Homeworks-owned customers can currently be edited locally in Jarvis
- Homeworks-owned invoices/payments can have local mutations
- local-only jobs can be created against Homeworks properties
- those local changes can later revert, duplicate, or contradict Homeworks

The finished architecture should be:

**Homeworks owns the operational record → Jarvis mirrors it read-only → legitimate Jarvis changes write through Homeworks first → Jarvis re-projects the confirmed result.**

## DO NOT REDESIGN WHAT ALREADY WORKS

Do not unnecessarily rewrite:

- the automatic Homeworks sync worker
- `homeworks_apply_page`
- `orderScheduleJobs`
- the shared schedule read path
- the existing propose → confirm → `action_requests` architecture

Preserve proven behavior unless a change is required for this task.

## STEP 1 — INSPECT BEFORE MODIFYING

Inspect the actual current repository, database migrations, production configuration, and relevant action/UI code.

At minimum inspect:

- `docs/DATA_AUTHORITY.md`
- `docs/CURRENT_STATE.md`
- `docs/DECISIONS.md`
- `docs/ARCHITECTURE.md`
- `supabase/migrations/*`
- `src/lib/actions/jobs.ts`
- `src/lib/actions/clients.ts`
- `src/lib/actions/properties.ts`
- `src/lib/actions/invoices.ts`
- `src/lib/actions/quotes.ts`
- Homeworks sync worker
- `homeworks_apply_page`
- `writeHomeworksSchedule`
- AI action/tool definitions
- AI executor
- confirmation UI
- client/property/job/invoice/quote UI mutation controls

Do not rely on documentation when code contradicts it.

Treat the current production code and actual database behavior as evidence.

## STEP 2 — FORMAL DATA AUTHORITY

Enforce these ownership rules:

### HOMEWORKS OWNS

- customer identity
- contact information
- properties
- recurring service data
- scheduled visits/jobs
- scheduled date/time
- operational visit status
- estimates/quotes
- invoices
- Homeworks-originated payments
- service definitions where sourced from Homeworks

Supabase may contain projections of these records, but they must not become independent writable copies.

### JARVIS OWNS

Jarvis may continue to own data that Homeworks does not own, including:

- route ordering/preferences if Homeworks is not currently the route-order owner
- Jarvis notes
- owner tasks
- actual hours if intentionally Jarvis-native
- completion notes if intentionally Jarvis-native
- equipment
- AI/system state
- activity/audit records
- integration health/state

Do not accidentally block legitimate Jarvis-owned fields.

## STEP 3 — DATABASE-LEVEL ENFORCEMENT

Create a clean migration implementing database-enforced protection.

Protect Homeworks-owned rows in:

- `clients`
- `properties`
- `jobs`
- `quotes`
- `invoices`
- `payments`
- `services`

When a record is Homeworks-owned, ordinary authenticated/local application code must not be able to independently modify source-owned fields.

The legitimate sync worker using `service_role` must continue to work.

For jobs, preserve legitimate Jarvis-native fields such as:

- notes
- completion notes
- actual hours

if the current schema and intended architecture support them.

Also prevent:

- local-only jobs from being inserted against Homeworks-owned properties
- local payments from being inserted against Homeworks-owned invoices

Use complete, understandable SQL.

Do NOT use fragile `pg_get_functiondef` + string replacement migration hacks.

## STEP 4 — UI SAFETY

For Homeworks-owned records:

Remove or hide mutation controls that imply Jarvis is the owner.

Examples:

- Edit Customer
- Edit Property source-owned fields
- Record Payment
- Create Job against Homeworks property
- Quote creation/edit controls that create divergent state
- Invoice creation/edit controls that create divergent state

Replace them where useful with:

**Managed in Homeworks**

and show enough source information to make the ownership obvious.

Jarvis should still display the data.

## STEP 5 — AI SAFETY

Remove any AI action that creates invalid second-source operational state.

Specifically audit and remove where appropriate:

- `propose_create_job`
- `propose_assign_employee`

Remove them consistently from:

- action types
- tool allowlists
- AI tool definitions
- executor
- confirmation cards
- tests
- docs

Do not leave dead or partially connected action paths behind.

## STEP 6 — PRODUCTION DRIFT AUDIT

Run a READ-ONLY audit against production.

Do not delete, update, correct, or mutate production records during this audit.

Identify at minimum:

1. Local payments associated with Homeworks-owned invoices.
2. Local-only jobs associated with Homeworks-owned properties.
3. Any Homeworks-owned customer/property/invoice/quote fields that appear to have been changed by a non-sync path.
4. Any other obvious split-brain records discovered during inspection.

Report exact counts and enough identifying information for me to understand each affected record.

If potentially sensitive data is unnecessary, minimize what you display.

Do not automatically repair production drift.

## STEP 7 — REGRESSION TESTS

Create a rollback-safe database regression test such as:

`scripts/homeworks-ownership-regression.sql`

It must prove:

- normal authenticated mutation of Homeworks-owned source fields fails
- legitimate `service_role` sync writes succeed
- permitted Jarvis-owned job fields still work
- local job creation against a Homeworks property is blocked
- local payment creation against a Homeworks invoice is blocked

Also run relevant application tests.

At minimum run, if available:

- typecheck
- lint
- production build
- database ownership regression
- relevant existing schedule-authority tests
- relevant Playwright customer/job/invoice tests

Do not claim success from typecheck/build alone.

## STEP 8 — VERIFY NO SECOND WRITABLE CRM REMAINS

Search the entire production codebase for write paths affecting Homeworks-projected tables.

I want a concrete inventory of writers.

Classify every remaining writer as either:

**LEGITIMATE**
- automatic Homeworks sync projection
- verified Homeworks write-through operation

or

**REMOVE / BLOCK**

There should not be mysterious alternate writers.

Do not yet perform unrelated redesign work.

## STEP 9 — DOCUMENT REALITY

Update the relevant architecture/data-authority/current-state documentation so future coding agents are not given stale instructions.

The docs must clearly state:

**Homeworks-owned records are read-only projections inside Jarvis.**

Any modification to Homeworks-owned operational state must write to the owning system first and only appear in Jarvis after verification/reprojection.

Do not document capabilities that are not actually working.

## SAFETY / DEPLOYMENT RULES

You may:

- inspect production read-only
- edit code
- create migrations
- create tests
- run local/test builds
- run read-only SQL diagnostics
- create a branch
- commit changes on the working branch if appropriate

Do NOT:

- delete production customer/business records
- silently modify production invoices/payments
- overwrite Homeworks data
- destroy Supabase tables
- apply a destructive production migration without validating it
- push risky untested changes directly to production
- guess when source ownership is ambiguous

If a change is reversible and clearly required to complete this objective, proceed.

If an action would create a meaningful risk of production data loss or irreversible business disruption, stop only at that specific point and tell me exactly what approval is required.

Do not stop for ordinary coding decisions.

## ACCEPTANCE CRITERIA

This task is not finished until all of the following are true:

1. Homeworks-owned data cannot be independently changed in Jarvis through normal authenticated application/database paths.
2. Legitimate Homeworks sync still succeeds.
3. Legitimate schedule write-through still succeeds.
4. Local-only jobs cannot be created against Homeworks-owned properties.
5. Local payments cannot be recorded against Homeworks-owned invoices.
6. Invalid Jarvis UI mutation controls are gone or disabled.
7. Invalid AI actions are removed.
8. Regression tests prove the ownership boundary.
9. Typecheck/lint/build succeed or every existing unrelated failure is explicitly identified.
10. Production drift has been measured read-only.
11. No production drift was silently repaired.
12. The documentation matches the actual system.
13. You have enumerated every remaining code path capable of writing Homeworks-projected tables.

## FINAL REPORT

When finished, give me:

### 1. RESULT
PASS / PARTIAL / BLOCKED

### 2. WHAT YOU CHANGED
Exact files and major changes.

### 3. DATA AUTHORITY
Explain precisely what Homeworks owns versus what Jarvis owns after the work.

### 4. TEST RESULTS
List every test/command run and its result.

### 5. PRODUCTION DRIFT
Give counts and affected records discovered by the read-only audit.

### 6. REMAINING WRITERS
List every surviving code path that can write to Homeworks-projected tables and explain why it is legitimate.

### 7. PRODUCTION STATUS
State clearly whether anything has been deployed or migrated to production.

### 8. RISKS / BLOCKERS
Only real unresolved issues.

### 9. NEXT ACTION
Give me exactly one highest-value next development task after this is complete.

## OPERATING INSTRUCTION

Do the work.

Do not give me another architectural essay instead of modifying and validating the system.

Investigate → implement → test → inspect production read-only → verify → report.

Continue independently until the acceptance criteria are satisfied or you encounter a genuine external blocker such as missing credentials, required approval for a risky production operation, authentication/2FA, or an unavailable external service.