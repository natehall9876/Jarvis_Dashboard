# Decisions

Why things are built the way they are — so a future change doesn't
accidentally undo a deliberate choice.

## No service-role key, anywhere, ever

Every data access — human or Jarvis-originated, read or write — goes through
the same authenticated, RLS-scoped Supabase client. This was a constraint
from the start, not a limitation discovered later. It means some things
(e.g. a durable audit log) had to be designed as tables the authenticated
role can write to under RLS, rather than an admin-only backend process.

## The model never gets a generic write tool

Considered and rejected: a single flexible `execute_mutation(table, filter,
patch)` tool that the model could call for anything. Rejected because it
collapses the entire safety architecture into "trust the model's judgment
about what to change," which is exactly the failure mode
`docs/AI_GUARDRAILS.md` exists to prevent. Every write capability is instead
a specific, named tool with a closed, typed input — adding a new capability
means adding a new named tool, on purpose, every time.

## Propose/confirm is two separate HTTP endpoints, not one with a flag

`/api/ai-advisor` (reasoning, can produce a proposal) and
`/api/ai-advisor/execute-action` (the only thing that can execute one) are
deliberately separate routes rather than one endpoint with a
`confirm: true` parameter. This makes "the model can reach this" and "only
an explicit UI click can reach this" a property of which URL is called, not
a runtime branch that could be gotten wrong.

## Durability is additive and falls back, never blocks

Both `activity_log` and `action_requests` were designed so the app works
identically before and after their migration is applied — before, via an
in-memory fallback or a graceful empty state; after, with real durability.
This was chosen over making either table a hard dependency, because this
environment has no way to apply a migration itself (no service-role key, no
linked Supabase CLI project) — a hard dependency would have meant shipping
something broken by construction. See `docs/CURRENT_STATE.md` for exactly
what's pending.

## Two production-rate numbers, not one

`productionDollarsPerHour` (revenue ÷ job-attributed hours) and
`truePaidDollarsPerHour` (revenue ÷ every clocked crew hour) are exposed as
two separate, separately-labeled fields rather than picking "the" production
number. This was a direct response to the observation that a job-level
number structurally cannot see paid time that isn't attributed to a job
(drive time, gaps) — `time_entries.job_id` being nullable is exactly what
makes the second number possible, and collapsing them into one metric would
throw that signal away.

## Mock data lives in `src/mock/` and nothing imports it

Considered and rejected: seeding believable-looking placeholder data
directly into components for early UI development. Rejected because it
creates exactly the failure mode Nate flagged — a dashboard that "looks
built" while showing fiction. `src/mock/` exists for local UI experimentation
only, with a README stating the rule, and it's been re-verified this session
(grep, not assumption) that nothing in `src/app` or `src/lib/data` imports
it.

## Voice reuses `submit()`; there is no second intelligence path

The Web Speech API's transcript is handed to the exact same function a
typed question or a suggested-question chip already calls. This was a
constraint, not just a convenience: a separate "voice brain" would need its
own confirmation-safety guarantees re-verified independently, doubling the
attack surface for the exact failure mode `docs/AI_GUARDRAILS.md` #3 exists
to prevent.
