# Architecture

This documents what's actually built, not the long-term vision. See
`docs/CURRENT_STATE.md` for what's live vs. pending, and `docs/DECISIONS.md`
for why specific choices were made.

## Layers

```
DATABASE (Supabase/Postgres, RLS-scoped)
  ↓
DATA ACCESS  — src/lib/data/*  (every read query, returns DataResult<T>)
DOMAIN LOGIC — src/lib/calculations.ts, src/lib/actions/*  (pure math, mutations)
  ↓
UI            — src/app/(dashboard)/*, src/components/*
JARVIS         — src/lib/ai/*  (tools, provider, advisor loop, write actions)
```

Nothing in `src/lib/ai/*` talks to the database directly except through
`src/lib/data/*` (reads) and `src/lib/actions/*` (writes) — the same paths
the human-facing UI uses. There is no separate "AI data path."

## Authentication

`src/proxy.ts` (Next.js middleware) refreshes the Supabase session cookie on
every request and redirects signed-out users to `/login` for any non-API,
non-public route. `src/lib/supabase/server.ts` creates the per-request
Supabase client from that cookie — every query in the app runs as the
authenticated user, scoped by RLS. There is no service-role key anywhere in
this codebase.

`supabase/rls-policies.sql` — the actual live policy: every table has one
`authenticated_full_access` policy (any signed-in user can read/write
everything). This is a deliberate single-owner-tool model: there's no public
sign-up, so in practice only accounts created directly in the Supabase
dashboard can ever sign in. Multi-role permissions (owner/manager/crew) would
need real schema work (a `role` column somewhere) before they'd mean
anything — intentionally not built yet since there's only one user.

## Data model

Real Supabase tables (see `src/types/database.types.ts` for the authoritative
shape): `clients`, `properties`, `services`, `employees`, `routes`,
`service_agreements`, `route_stops`, `jobs`, `job_employees`, `time_entries`,
`equipment`, `job_equipment`, `equipment_maintenance`, `quotes`,
`quote_items`, `invoices`, `invoice_items`, `payments`, `expenses`,
`job_materials`, `job_photos`, `integration_mappings` (defined, not yet used
by any integration), `activity_log` and `action_requests` (defined in code,
**not yet applied to the live database** — see CURRENT_STATE.md).

Plan vs. actual already exists on `jobs`: `budgeted_hours`/`actual_hours`,
`price`, `scheduled_date` vs. `started_at`/`completed_at`, and a `status`
lifecycle (`scheduled → in_progress → completed`, plus `cancelled`/
`skipped`).

## Jarvis

- `src/lib/ai/provider.ts` + `src/lib/ai/providers/anthropic.ts` — a small
  vendor-neutral interface over Anthropic's Messages API (raw `fetch`, no
  SDK). Adding a second provider means one new file implementing the same
  interface.
- `src/lib/ai/tools/*` — the tool registry. Every read tool wraps a
  `src/lib/data/*` query. `src/lib/ai/tools/actions.ts` holds the only tools
  that touch writes, and even those only read the current record and return
  a `ProposedAction` — never a mutation.
- `src/lib/ai/advisor.ts` — the agent loop: sends the question + tool specs
  to the model, executes whatever tools it calls, feeds results back, repeats
  until a final text answer. Detects a `ProposedAction` in a tool result and
  forces the model to stop (via `tool_choice: "none"`) instead of chaining
  further tool calls that turn.
- `src/lib/ai/action-types.ts` — the **allowlist**. `ProposedActionType` is a
  closed union (`reschedule_job | update_job_status | assign_employee |
  create_job`) — the model can never produce a shape outside this union, and
  there is no generic "table/column" field anywhere. `isProposedAction()` is
  the runtime guard the execute-action endpoint uses to reject anything else.
- `src/lib/ai/actions/execute.ts` — the only code that actually performs a
  Jarvis-originated write. Re-validates every field, re-reads the current
  record, rejects a stale snapshot, claims the action id via `action_requests`
  (falls back to an in-memory guard if that table isn't migrated yet), calls
  the same mutation functions the human-facing forms use
  (`src/lib/actions/jobs.ts`), re-reads the result to verify, and logs to
  `activity_log`.
- `src/app/api/ai-advisor/route.ts` — the read/reasoning endpoint the model's
  answers come through.
- `src/app/api/ai-advisor/execute-action/route.ts` — the **only** endpoint
  that can turn a proposal into a real write. The model has no access to it;
  it's called exclusively by the owner clicking Confirm in the UI.

## Data trust — distinctions the app (and Jarvis) must never blur

- **Field production $/hr** (`productionDollarsPerHour`) = revenue ÷ hours
  logged against specific jobs (`jobs.actual_hours`) — on-site time only.
- **True paid $/hr** (`truePaidDollarsPerHour`) = revenue ÷ every clocked
  crew hour in `time_entries` for the same period. `time_entries.job_id` is
  nullable, so this captures drive time, gaps, and anything paid for but not
  attributed to a job — a job-level number structurally cannot. Both live in
  `src/lib/calculations.ts` and `src/lib/data/command-center.ts`.
- **Completed ≠ invoiced ≠ paid.** A job's `status` and an invoice's
  `display_status` are separate lifecycles; `src/lib/calculations.ts`'s
  `invoiceDisplayStatus` derives `paid/overdue/partial` from balance and due
  date rather than trusting a raw stored value for those states.
- **Revenue ≠ cash collected.** Business Pulse shows both
  (`revenueMonth` vs. `cashCollectedMonth`) rather than one blended number.
- A void invoice's remaining balance is cancelled debt, not outstanding
  receivable — excluded from AR calculations on purpose.

Jarvis's system prompt (`src/lib/ai/advisor.ts`) explicitly instructs it to
treat these as different numbers and explain a gap when one shows up, not
silently pick one.

## Activity history

`activity_log` (not yet live — see CURRENT_STATE.md) is an append-only table:
`entity_type`, `entity_id`, `event_type`, `summary`, `detail` (jsonb),
`source` (`jarvis`/`owner`/`system`). `src/lib/data/activity-log.ts`'s
`logActivity()` is best-effort and never throws — a missing audit trail must
never be the reason a real action fails. Currently wired into job, invoice,
and quote mutations (both the Jarvis executor and the human-facing forms in
`src/lib/actions/*`). Not yet wired into clients, properties, or equipment.

## What's intentionally not built yet

Role/permission tables (no second user exists), a dedicated recommendations
table with accept/reject/outcome tracking (the deterministic
`get_attention_items`/`get_owner_briefing` tools cover the "evidence-backed"
requirement today without one), route-level true-paid $/hr breakdown
(company-wide only so far), any real QuickBooks/Homeworks/Google Calendar
sync, a visible "Jarvis orb" UI centerpiece.
