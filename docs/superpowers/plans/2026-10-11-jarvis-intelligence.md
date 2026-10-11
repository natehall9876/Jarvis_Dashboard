# Jarvis Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Ship an evidence-based business decision loop with recurring operational scans, external research, prepared work and tracked outcomes.
**Architecture:** Owner-scoped Supabase intelligence tables and authenticated APIs power /intelligence. A bounded worker computes operational findings; a hosted hourly analyst imports sourced research through a service-only RPC. The dashboard ranks three actions and provides prepared deliverables and state/outcome control.
**Tech Stack:** Existing Next.js 16.3.8, React, TypeScript, Supabase PostgreSQL, PGlite, Playwright.
**Spec:** docs/superpowers/specs/2026-10-11-jarvis-intelligence-design.md

## Global Constraints
- No source-business writes, communications, purchases, new paid provider, secret exposure or weakened access controls.
- Preserve existing dashboard, Workshop, voice and Homeworks authority.
- Source errors are not zero values. Unknown money, hours, costs and capital remain unknown.
- Top decisions contain at most three current items; score is a heuristic, not an expected return.
- Imported evidence is data, never instructions; active owner isolation and bounded reads/writes are mandatory.
- A prepared draft is not a sent message; actual outcomes are explicitly owner-reported.
- The research automation is hourly; the internal worker is every 15 minutes; each reports actual run evidence independently.

## Review Focus
- Stale scans or late concurrent imports must not overwrite newer facts or reopen a completed/dismissed item.
- Confirmed-demo/deleted rows, null hours and zero-price appointments must not produce invented margin or receivables.
- Missing or malformed external evidence must not reach Act now.
- Write retries, invalid outcomes and unauthorized RPC/API callers must not corrupt decisions.
- Mobile card detail, links and sticky/overflow controls must remain usable.

### Task 1: Durable intelligence engine and APIs
**Files:** Create src/lib/intelligence/{types,model,diagnostics,storage,worker}.ts; src/app/api/jarvis/intelligence/route.ts; src/app/api/jarvis/intelligence/worker/route.ts; supabase/migrations/*_jarvis_intelligence.sql; scripts/test-jarvis-intelligence.mjs; docs/JARVIS_INTELLIGENCE.md. Modify package.json and CI for tests.
**Interfaces:** Publish types and API contract in docs/JARVIS_INTELLIGENCE.md for Task 2. Export getIntelligence() authenticated data read for advisor tool, and runIntelligenceWorker() service worker. GET endpoint returns settings, items, recent runs and coverage; POST refresh and PATCH/POST decisions/preferences/outcomes follow documented discriminated actions. Service-only jarvis_import_intelligence(p_owner uuid,p_run jsonb,p_items jsonb) is the stable hosted-analyst import entry point, accepting exactly documented shapes. Ensure importer records zero-finding/failed run without inventing items.
- [ ] Add meaningful failing pure/DB/API tests for diagnostics arithmetic, deleted/demo/null source data, unsafe/missing citations, owner isolation, dedup and non-regression, manual-state persistence, atomic scan lease, failed source handling, and output bounds.
- [ ] Implement migration: settings, runs, items, and persisted prepared work/outcome fields (separate table optional only if needed). Active-owner RLS and ingestion/service grants. Owner settings include hourly target130, watches/interests and enabled state; defaults fit WeedEater plus cross-industry low-capital opportunities without inventing a capital budget.
- [ ] Implement bounded internal reads and deterministic diagnostics. Scan current invoices/quotes/jobs and source freshness; include qualified invoice draft, quote followup draft, planned $/budget-hour comparison, status/time-record gap worksheet. Priority/expires/evidence explicitly computed. Auto-prepare concrete content and stamp it. Never mark source row complete. Regenerate facts without overwriting decisions or owner outcome.
- [ ] Implement lease-aware 15-minute scan worker and manual refresh. Worker validates active owner, cleanly records per-source failure/partial coverage and skips disabled prefs. No OpenAI/Anthropic paid calls needed. Worker uses existing CRON_SECRET auth.
- [ ] Implement owner APIs with input bounds, safe URLs, finite nonnegative outcome values, allowed transitions and same-origin check. Responses distinguish stale results and source gaps.
- [ ] Run npm run test:intelligence, npm run typecheck and targeted ESLint. Commit only task files and write the report with contract, exact tests and limitations.

### Task 2: Intelligence UI and Jarvis access
**Files:** Create src/app/(dashboard)/intelligence/page.tsx, src/components/intelligence/*; modify existing nav-config/sidebar/mobile nav as needed, add read-only AI tool and concise advisor routing. Add isolated rendering tests.
**Interfaces:** Consume Task 1 documented types and APIs; do not duplicate diagnostic logic.
- [ ] Read Task 1 API docs and current design tokens. Build /intelligence with top3 current decisions and Act now/Ready for review/Watch/Outcomes views, visible last internal/external run and coverage freshness.
- [ ] Cards lead action/why/impact basis, then expandable exact evidence, facts vs inference, prepared work and validation/stop criteria. No fake metrics, agent avatars claiming running work, invented ROI or decorative charts. Show loading/empty/error/retry.
- [ ] Provide actual persistent accept/watch/dismiss/complete and owner outcome capture; saved preferences target/interests/enabled. Prepared packet can be read/copied; clarify next action/approval boundary.
- [ ] Add visible nav entry and compact Command Center entry so the main dashboard points to this system without redesign.
- [ ] Add get_business_intelligence read tool using authenticated getIntelligence, route strategy/opportunity asks to it, keep replies brief and factual. Do not add autonomous business mutations.
- [ ] Test render, state transitions and 390px usability; run typecheck/lint and isolated relevant suites. Commit and report.

### Task 3: Research activation, integration and production release
**Owner:** Root coordinates tools and a research specialist; no concurrent source edits.
- [ ] Verify current Supabase read access and web sources; discover existing automations privately to prevent duplicate scanners.
- [ ] Research first real opportunities using primary sources. Import only findings with a concrete mechanism and next step; explicitly track zero qualified results if no evidence qualifies.
- [ ] Configure one hourly research automation using the exact importer and owner identity, source/freshness/quality threshold and no-news notification rules. Record task ID and configured cadence in settings/coverage. Call required read-only connectors before creation.
- [ ] Review whole branch using a fresh reviewer with diff. Resolve material findings with covering tests, then typecheck/lint/build/client-secret check plus relevant database/regression gates.
- [ ] Apply migration, deploy authorized feature via reviewed PR, install named 15-minute cron using existing Vault secret, run and verify actual production worker and UI. Run research now and inspect stored completed run.
- [ ] Record release evidence and unresolved limits, update plan; hand Nate the verified live link and highest-value first action.

