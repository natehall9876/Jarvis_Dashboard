# AI Guardrails

Rules that must hold for every future change to `src/lib/ai/*`. If a change
would violate one of these, it needs an explicit, deliberate decision — not
a side effect of adding a feature.

## 1. The model never gets a generic mutation tool

`src/lib/ai/action-types.ts`'s `ProposedActionType` is a closed union. There
is no tool that accepts a table name, column name, or arbitrary SQL/filter.
Every write capability is a specific, named, purpose-built tool
(`propose_reschedule_job`, etc.) with its own typed input schema. Adding a
new write capability means adding a new union member and a new
`propose_*`/`execute*` pair — never a generic "run this mutation" escape
hatch.

## 2. Propose ≠ execute

Every `propose_*` tool in `src/lib/ai/tools/actions.ts` only reads data and
returns a `ProposedAction`. It never calls `.insert()`/`.update()`/
`.delete()`. The only code that performs a Jarvis-originated write is
`src/lib/ai/actions/execute.ts`, reached only through
`/api/ai-advisor/execute-action` — an endpoint the model has no way to call.
The advisor loop (`src/lib/ai/advisor.ts`) forces a text-only reply
(`tool_choice: "none"`) the turn a proposal is generated, so the model can't
chain a second action before the first is confirmed.

## 3. Confirmation is a UI action, never inferred from text

Voice or typed text containing "yes," "confirm," "do it," etc. must never be
interpreted as confirming a proposal. The only thing that calls
`/api/ai-advisor/execute-action` is `ProposedActionCard`'s `confirm()`
function, which only runs on an explicit click/tap of its own Confirm
button. Verified live: a transcript literally containing "confirm that"
produces zero execute-action calls, because voice only ever reaches
`submit()` (the same path as typed text), never the Confirm button.

## 4. Never guess a write target

A `propose_*` tool requires an exact id (`job_id`, `employee_id`,
`property_id`) — never a name or fuzzy match. The system prompt explicitly
instructs the model: if a request could match more than one record, ask
which one or list candidates — never call a `propose_*` tool with a guessed
id. This is verified behavior (an ambiguous "reschedule the client's job"
request, when the client has two jobs, produces a clarifying question and no
proposal at all).

## 5. Read-before-write, and re-validate at execution time

Every `propose_*` tool reads the current record and includes a snapshot
(currently `updated_at`) in the proposal. `execute.ts` re-reads the record at
confirmation time and rejects the action if the snapshot doesn't match
(`reason: "stale"`) — the record changed between proposal and confirmation.
Every field in the payload is re-validated against real constraints
(job status enum, date format, record existence) at execution time — nothing
from the client request is trusted just because it round-tripped through the
UI.

## 6. Exactly-once execution

An action id can execute at most once. See `docs/ARCHITECTURE.md`'s
description of `action_requests` / the in-memory fallback. Never remove this
guard to "simplify" the executor.

## 7. Never fabricate a number, a fact, or a confidence level

The system prompt instructs Jarvis to say plainly when data is insufficient
rather than estimate. Deterministic values (revenue, hours, production
rates) come from `src/lib/calculations.ts` and `src/lib/data/*` — the model
is handed pre-computed numbers, never asked to do the arithmetic itself. If
a future confidence/evidence field is added to a recommendation, it must be
computed from real sample size / data completeness, not asserted by the
model.

## 8. Secrets never reach the model or the client

`AI_PROVIDER_API_KEY` is read only in server-only files
(`src/lib/env.ts`, `src/lib/ai/providers/anthropic.ts`) and used only in an
HTTP header to Anthropic — it is never placed in the model's context, a
response body, a log line, or a client bundle. A direct prompt-injection
attempt to extract it or the system prompt has been tested and refused by
the model; this is also structurally impossible regardless of the model's
behavior, since the key is never in-context to begin with.

## 9. No service-role key, ever

Every Supabase call — read or write, human or Jarvis-originated — goes
through the same authenticated, RLS-scoped client
(`src/lib/supabase/server.ts`). There is no service-role key in this
codebase and no code path that would need one added.
