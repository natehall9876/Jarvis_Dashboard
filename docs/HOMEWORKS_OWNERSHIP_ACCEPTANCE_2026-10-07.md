# Homeworks ownership acceptance — October 7, 2026

## 1. Result

Implementation and independent review complete. Release verification is in progress; production status below is authoritative.

## 2. What changed

- `supabase/migrations/20261007023608_homeworks_ownership_guards.sql`: invoker-rights triggers across 12 projected/child tables; ownership from source markers, retained identity and old/new parent lineage; actual service-role exception; native-field allowlist; unsafe ordinary-role privileges revoked. No business rows repaired or deleted.
- `src/lib/actions/homeworks-ownership.ts`, guarded client/property/job/employee/quote/invoice actions, and `src/lib/homeworks-ownership.ts`: fail closed on missing ownership, validate parents and item IDs before writes, protect source schedule/crew/financial fields, preserve native notes/hours/staffing fields.
- Detail pages, forms and photo worksheet controls: display source ownership, hide invalid actions and creation options, preserve notes-only forms; inherited ownership is handled even without a source ID. Linked job schedule/status retains existing verified write-through.
- AI types, tools, executor, confirmation card and voice references: remove create-job/assign-employee; reject stale/forged retired requests before mutation. Keep propose/confirm/action_requests and five legitimate actions.
- Legacy import, webhook, export ingestion, linking, enrichment and historical mutation bodies: retired before I/O. Automatic worker and read-only diagnostics remain.
- SQL/application regressions, an isolated schema fixture and runner, a read-only audit query, complete writer inventory and current architecture documentation added/updated. Existing projector, automatic worker, schedule ordering and shared schedule read implementation retained.

An exact changed-file manifest appears below. Native invoice/quote notes, property worksheet ancestry and inherited-job controls were three independent-review findings; each was corrected and regression-covered before release.

## 3. Data authority

**Homeworks-owned records are read-only projections inside Jarvis.** Homeworks owns customer identity/contact/status, property details, recurring operational data, visits and schedule/status, source crew/service/price/budget, estimates, invoices, source payments, source services and source employee identity/contact/activity. Source changes use Homeworks first and verified projection afterward.

Jarvis keeps separate notes (including customer, property, job, invoice and quote notes), completion notes, actual hours, existing assignment hours, native staffing/payroll enrichment, route preferences, tasks, equipment, AI/audit/integration state and independent local records. Native records cannot become parallel operational children of source parents. See [field authority](DATA_AUTHORITY.md) for exact fields.

## 4. Test results

| Validation command/check | Result |
| --- | --- |
| `npm ci` | Passed locally and in isolated NatesPC worktree. |
| `npm run typecheck` | Passed after final source changes. |
| `npm run lint` | Existing baseline error in `src/app/(dashboard)/homeworks/page.tsx:23` (`react-hooks/purity`, `Date.now()` during render); existing warning in `src/lib/data/command-center.ts:23` (unused `JOB_RELATIONS_SELECT`). Both confirmed in unchanged baseline `3466b8a`. |
| ESLint for all 62 changed/new TS/TSX/MJS files | Passed. |
| `npm run build` | Passed, Next.js 16.3.4 production build. |
| `npm run verify:no-client-secrets` | Passed: 30 compiled client JavaScript files, no server-secret references. |
| `npm run test:ownership:db -- --baseline` | Expected failure: ordinary authenticated owner could update source customer email, proving the old gap. |
| `npm run test:ownership:db` | Passed locally and on NatesPC. Ownership/native-note/route/anti-spoof/parent/child/delete/privilege checks; real service-role RPC; rollback; existing idempotency, explicit clear, native-note preservation, checkpoint/dependency rollback, invoice lines, due dates and schedule authority SQL. |
| `npx playwright test --workers=2 --reporter=line` | 950/952 passed. Two mobile Safari voice tests timed out waiting for the unchanged conversation button; every ownership/schedule/customer/job/billing case passed. Focused recheck: 5/6 passed, same conversation-button timeout once. Unchanged baseline `3466b8a` independently reproduced the same timeout (5/6 passed). |
| Focused action regressions using isolated no-webserver Playwright config | Final 29 action cases passed; earlier combined 62 action/schedule/AI/notes cases passed before four extra financial-note cases. |
| Focused UI regressions using isolated no-webserver Playwright config | Final 22 cases passed, including actual page boundaries, inherited ownership, completed photo extraction and native billing notes. |
| Focused AI plus notes/tasks | 23 passed (12 AI + 11 notes/tasks). |
| Focused legacy retirement and integration reliability | 32 changed-path cases passed; 95 related pure regression cases passed. Included in the full suite above. |
| `git diff --check` and independent review | Passed. Review independently ran DB tests and checked cascade/set-null enforcement and projector fingerprint. No remaining important findings. |

Temporary no-webserver configurations were necessary in the local execution workspace because `next dev` hit an `os.networkInterfaces()` EPERM and browser ZIP downloads failed. The final full browser suite ran on NatesPC with existing Chromium/WebKit and dummy Supabase values, isolated from production business data. No live persistence fixtures were run.

Focused development commands used `npx playwright test --config` with `/tmp/jarvis-ownership-actions.playwright.config.cjs`, `/tmp/ownership-ui-playwright.config.cjs`, `/tmp/jarvis-ai-ownership.playwright.config.cjs` and `/tmp/jarvis-legacy-audit.config.ts`. These temporary configs only select repository specs; the tests themselves are committed. The focused browser recheck command was `npx playwright test e2e/voice-flow.spec.ts --project=mobile-safari --workers=1 --grep "typed question|muting spoken replies" --repeat-each=3 --retries=0 --reporter=line`, run against this branch and unchanged baseline. The initial baseline launch in the OneDrive checkout hit the 60-second dev-server startup timeout; a separate baseline worktree with its own `npm ci` reproduced the actual voice failure. A temporary dependency junction was rejected by Turbopack and removed before that clean install. Production schema/functions/grants/configuration and git baseline were inspected read-only. Direct source schedule mutation was not performed on real business visits; preservation is verified by existing mocked provider/action tests and the real isolated projector/schedule SQL.

## 5. Production drift

Read-only observation: 2026-10-07 02:38:01–02:42:56 UTC. No repair or business mutation occurred during the audit.

| Check | Observed |
| --- | ---: |
| Top-level projections checked | 373 |
| Source line items checked | 103 |
| Local payments on source invoices/clients | 0 |
| Local jobs on source properties | 0 |
| Other local operational children on source parents | 0 |
| Source-field, line, pointer, reference, crew or route-order mismatches | 0 |
| Healthy source streams | 21 |
| Successful runs in preceding 24 hours | 136 |

Breakdown: 71 clients, 26 properties, 233 jobs, 26 invoices, 2 quotes, 7 payments, 6 services, 2 employees; 101 invoice items and 2 quote items. Eight historical owner-labelled enrichment activity rows exist, with exact IDs in the [audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md); their current fields match source and they do not prove present drift or complete update attribution. Forty-eight native job notes and customer contact-preference defaults are not source drift. This audit compares retained source payloads to projections; it does not independently fetch every source record. Current/source crew was empty, so only the empty crew case had live evidence.

## 6. Remaining writers

The [complete writer inventory](HOMEWORKS_WRITERS.md) names every function, entry point, table and privilege boundary. Only two chains can change source-owned fields:

1. Scheduled secret-protected route → automatic worker/core → service-role `homeworks_apply_page`.
2. Owner-authorized job date/time/status → `writeHomeworksSchedule` → verified Homeworks response → the same service-role projector.

The guarded session actions remain legitimate only for native fields/independent local records: clients/properties/employees create-update-archive; job insertion/crew/update/status; quote/invoice creation, edits, lines, status, conversion and native payment helpers; worksheet conversion through `insertJob`. Source operational uses are blocked. AI schedule/status reaches shared guarded job helpers; notes/tasks/action-state write only native tables. No other business service-role writer remains. Database triggers protect ordinary direct REST/SQL, children and cascades too. The service credential remains a trusted server boundary.

## 7. Production status

PENDING: application deployment and ownership migration have not yet been performed. Pre-release recheck at 02:59:37 UTC still found zero ownership triggers and the unchanged projector fingerprint `485e73e84f4620b7845ed3949fad9066`. Latest scheduled run at that point completed successfully at 02:55:06 UTC.

## 8. Risks / blockers

- Baseline lint findings listed above remain outside this ownership change.
- Mobile Safari voice conversation-button timeout is pre-existing: reproduced on unchanged `3466b8a`. Neither the voice component nor these test cases changed. The ownership suite passed; the full suite is not claimed all-green.
- Production rollout verification pending.
- No real Homeworks visit was changed as a test. Schema-only isolated regression and actual post-release read-only checks must not be described as a live provider mutation test.

## 9. Next action

Add scheduled read-only drift detection using the committed audit logic, with an owner-visible alert when a projection diverges or sync becomes stale.

## Exact changed-file manifest

- `README.md`
- `docs/AI_GUARDRAILS.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATE.md`
- `docs/DATA_AUTHORITY.md`
- `docs/DECISIONS.md`
- `docs/HOMEWORKS_AUTOMATIC_SYNC.md`
- `docs/HOMEWORKS_OWNERSHIP_ACCEPTANCE_2026-10-07.md`
- `docs/HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md`
- `docs/HOMEWORKS_VERIFICATION.md`
- `docs/HOMEWORKS_WRITERS.md`
- `docs/INTEGRATION_AUDIT_2026-10-03.md`
- `docs/JARVIS_V1_ACCEPTANCE_2026-10-06.md`
- `docs/TESTING.md`
- `docs/TRIAL_RUNBOOK.md`
- `docs/WORKFLOW_VERIFICATION.md`
- `docs/superpowers/plans/2026-10-07-homeworks-ownership-spec.md`
- `docs/superpowers/plans/2026-10-07-homeworks-ownership.md`
- `e2e/ai-homeworks-ownership.spec.ts`
- `e2e/homeworks-ownership-actions.spec.ts`
- `e2e/homeworks-ownership-ui.spec.ts`
- `e2e/homeworks-webhook.spec.ts`
- `e2e/homeworks-write-safety.spec.ts`
- `e2e/integration-reliability.spec.ts`
- `package-lock.json`
- `package.json`
- `scripts/fixtures/homeworks-production-schema-20261007.sql`
- `scripts/homeworks-ownership-regression.sql`
- `scripts/homeworks-production-drift-audit.sql`
- `scripts/homeworks-sync-regression.sql`
- `scripts/schedule-authority-regression.sql`
- `scripts/test-homeworks-ownership.mjs`
- `src/app/(dashboard)/clients/[id]/page.tsx`
- `src/app/(dashboard)/employees/[id]/page.tsx`
- `src/app/(dashboard)/invoices/[id]/page.tsx`
- `src/app/(dashboard)/properties/[id]/page.tsx`
- `src/app/(dashboard)/quotes/[id]/page.tsx`
- `src/app/(dashboard)/settings/homeworks-import/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`
- `src/app/api/integrations/homeworks/admin-import/route.ts`
- `src/app/api/integrations/homeworks/import/route.ts`
- `src/app/api/integrations/homeworks/webhook/route.ts`
- `src/components/ai-advisor/proposed-action-card.tsx`
- `src/components/clients/client-form.tsx`
- `src/components/employees/employee-form.tsx`
- `src/components/homeworks-managed-notice.tsx`
- `src/components/invoices/invoice-form.tsx`
- `src/components/jobs/job-detail-view.tsx`
- `src/components/jobs/job-form.tsx`
- `src/components/photos/photo-upload-form.tsx`
- `src/components/properties/property-form.tsx`
- `src/components/quotes/quote-form.tsx`
- `src/components/settings/homeworks-connection-card.tsx`
- `src/components/settings/homeworks-enrich-panel.tsx`
- `src/components/settings/homeworks-historical-panel.tsx`
- `src/components/settings/homeworks-import-form.tsx`
- `src/components/settings/homeworks-link-panel.tsx`
- `src/components/settings/homeworks-sync-status-panel.tsx`
- `src/lib/actions/clients.ts`
- `src/lib/actions/employees.ts`
- `src/lib/actions/homeworks-enrich.ts`
- `src/lib/actions/homeworks-historical.ts`
- `src/lib/actions/homeworks-import.ts`
- `src/lib/actions/homeworks-job-sync.ts`
- `src/lib/actions/homeworks-link.ts`
- `src/lib/actions/homeworks-ownership.ts`
- `src/lib/actions/invoices.ts`
- `src/lib/actions/jobs.ts`
- `src/lib/actions/photos.ts`
- `src/lib/actions/properties.ts`
- `src/lib/actions/quotes.ts`
- `src/lib/ai/action-types.ts`
- `src/lib/ai/actions/execute.ts`
- `src/lib/ai/advisor.ts`
- `src/lib/ai/tools/actions.ts`
- `src/lib/ai/tools/index.ts`
- `src/lib/data/invoices.ts`
- `src/lib/data/jobs.ts`
- `src/lib/data/options.ts`
- `src/lib/data/properties.ts`
- `src/lib/data/quotes.ts`
- `src/lib/homeworks-ownership.ts`
- `src/lib/integrations/homeworks-sync.ts`
- `src/lib/jarvis/voice-utils.ts`
- `src/mock/sample-data.ts`
- `src/types/database.types.ts`
- `src/types/domain.ts`
- `supabase/migrations/20261007023608_homeworks_ownership_guards.sql`
