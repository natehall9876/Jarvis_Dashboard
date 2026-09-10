# Data Authority

Who is allowed to be the source of truth for what — today, and the intended
direction as real integrations get built.

## Today

**Supabase is the only system of record.** Every table in
`src/types/database.types.ts` is written to exclusively by this app (human
forms in `src/lib/actions/*`, or Jarvis-confirmed actions in
`src/lib/ai/actions/execute.ts`). Nothing syncs in or out yet —
`integration_mappings` exists in the schema for exactly this future need but
is not used by any code path today.

## Intended direction (not yet built)

| System | Authoritative for | Jarvis's relationship to it |
|---|---|---|
| **QuickBooks Online** | Accounting, general ledger, reconciled financial state | Reads financial data, turns it into operating intelligence — never writes accounting entries |
| **Homeworks** | Whatever operational/customer/invoice/SMS workflows it already handles reliably | Reads for context; does not duplicate working Homeworks functionality just to say Jarvis can do it |
| **Google Calendar** | Owner availability, personal/business timing constraints | Reads for scheduling context |
| **Weather provider** (currently National Weather Service, `src/lib/integrations/weather.ts`) | Weather facts | Reads facts; Jarvis (not the weather API) makes the business-risk judgment from those facts |
| **Jarvis / Supabase** | Operational intelligence, recommendation history, enriched property data, internal notes, activity history | The synthesis layer above every other system |

## The rule that must not be violated

No two systems should ever both consider themselves the writer of the same
field. When a real integration is eventually built, it needs an explicit
answer to "who wins if Homeworks and Jarvis disagree about this job's
status" before the sync code is written — not as an afterthought. Until an
integration has that answer, it stays read-only.

## Why `integration_mappings` exists but is unused

The table (`system_name`, `entity_type`, `internal_id`, `external_id`,
`last_synced_at`, `metadata`) was designed as the eventual place to record
"this Jarvis job corresponds to this Homeworks job" without stuffing a
`homeworks_id` column onto `jobs` directly (and then a `quickbooks_id`
column, and so on, for every future integration). It's there so the first
real integration doesn't have to invent this pattern under time pressure —
it isn't there because an integration is imminent.
