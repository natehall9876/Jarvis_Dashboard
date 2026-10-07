# Homeworks ownership implementation plan

**Goal:** Enforce Homeworks-owned records as read-only projections in Jarvis.
**Architecture:** Database triggers enforce source-field and parent ownership for authenticated writes. Existing automatic projection and verified schedule write-through remain the privileged writers. Server/UI guards explain rejection before partial local changes; retired AI/import paths cannot bypass the boundary.
**Tech stack:** Next.js 16, Supabase/Postgres, Playwright.
**Spec:** `2026-10-07-homeworks-ownership-spec.md` in this directory.

## Constraints and decisions

- Keep automatic worker, projection, schedule ordering/read path and propose/confirm/action_requests architecture intact.
- Production drift audit is read-only. Do not repair business records.
- Preserve Jarvis job notes/completion notes/actual hours, client notes, property access/service notes and route preferences. Source notes remain in homeworks_notes.
- Source markers cannot be added, removed or changed by ordinary callers. Child invoice/quote lines and crew assignments must not bypass protected parents.
- Existing independent local records remain editable, but cannot be attached to Homeworks parents to create parallel operations.

## Review focus

- Clearing source markers or moving children between parents must not escape guards.
- DELETE/cascade/line-item changes must not bypass UPDATE protection.
- Service-role projection must preserve native enrichment and remain service-only.
- Stale/retired AI proposals and legacy authenticated/service-role imports must fail closed.
- Audit mismatches are evidence of drift, not proof of who changed a field without history.

## Tasks

1. Database guards: create migration through CLI; write rollback-safe SQL regression first; prove authenticated source writes/deletes/inserts/reparenting fail, permitted notes/hours succeed, service projection succeeds. Validate on isolated Postgres.
2. Server/UI: guard existing actions and foreign keys before writes; hide invalid source controls and show source IDs; keep local/native functions. Cover forged action IDs and deep links with focused tests.
3. AI/legacy: remove create-job/assign-employee tool/action/executor/card paths; retire every alternative projection writer; cover stale proposals and no-write retirement errors.
4. Read-only production audit: compare mirrors to retained source payloads, count divergent local children and record sync health/configuration. Never mutate during audit.
5. Verification/documentation: run typecheck/lint/build, all relevant application tests, SQL guards, sync and schedule regressions; inventory every surviving writer; document exact deployment state and unresolved gates.

## Progress

- Baseline: clean clone of origin/main `3466b8a`; matches canonical Windows repository. Installed locked dependencies.
- Root-cause inspection: unguarded local customer/property/billing mutations and independent legacy import/link/enrichment sinks exist. Database migration history protects sync RPC permissions but not ordinary table source writes.
- Work isolated on `fix/homeworks-ownership-20261007`; automatic worker/projector/schedule implementation retained.
- Implemented database guards, server/UI restrictions, native-note preservation and retired AI/legacy writers. Independent review findings fixed and reviewed again.
- Read-only production audit complete: zero current drift across 373 records and 103 lines, no repairs.
- Database and existing sync/schedule regressions, typecheck, production build and secret checks passed. Full suite: 950/952; two mobile voice timeouts, with the same conversation-button failure reproduced on unchanged baseline. Changed-file lint passes; full lint has two unchanged baseline findings.
- Detailed acceptance and release evidence: `../../HOMEWORKS_OWNERSHIP_ACCEPTANCE_2026-10-07.md`.

- Released implementation `b7368ac` to production; installed migration version `20261007030921`; verified all 12 guard fingerprints/privileges and the successful 03:10 scheduled run. Final docs and migration filename are aligned with observed production history.
