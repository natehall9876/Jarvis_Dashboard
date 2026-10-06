# Data authority — verified October 6, 2026

Homeworks is the operational source of truth for synced customers, properties, dated visits, visit status, service prices, labor budgets and crew assignments. Supabase mirrors those records through the existing automatic worker; Jarvis reads that mirror. It must not substitute a hard-coded customer schedule.

## Schedule and route order

- Homeworks supplies actual visit membership and dates, including cancellations and deletions.
- An explicit Homeworks route stop for the visit date wins for visit order.
- When Homeworks has no explicit route order, the owner's persisted, active weekday route preference supplies order by property ID. This only orders visits that exist. It never fabricates appointments or revenue.
- A saved route stop without a visit is shown as a missing-visit notice and excluded from confirmed workload/revenue.
- Deterministic fallback: date, effective stop order, appointment time, stable job ID. The Schedule, today's mission, workload and first-job lookup use the same read function.
- Demo routes are archived; confirmed demo and Homeworks-deleted jobs are excluded from operations.
- There is no runtime customer-name list or auto-generation of recurring jobs.

## Writes

Date/time and supported status edits to an existing Homeworks visit write to Homeworks first, then project the verified source response while holding the same sync lease as the background worker. A source failure must not save a conflicting local schedule. A projection failure after source success explicitly says the source saved and automatic sync must catch up.

Homeworks-owned service, property, price, budget and crew edits are blocked locally and must be made in Homeworks. Jarvis owns internal notes, completion notes and actual-hours enrichment. Local-only jobs retain local editing.

Saved route preferences use an owner-authorized, RLS-scoped atomic database function. Stale membership and partial reorder payloads are rejected. Save failures remain visible in the route editor.

The event stream reads route stops on every scheduled run because changing a route alone need not advance an event's updatedAt timestamp. Other entity stream logic, OAuth, checkpoints, locks, retries, cron and billing projections remain as implemented by the Homeworks integration task.

## Monday owner correction

The owner's October 6 correction was saved as 13 ordered property references. On October 5, Homeworks currently contains 10 corresponding visits. Richard Martin, Richard Carbone and Rayna Foster at 2 Penbryn Avenue have no visit that day.

Automatic approval review rejected creating these three external visit records. No visits, invoices or customer messages were created. The route preference is saved; missing visits must remain visibly unconfirmed until creation is approved and Homeworks is updated.

## Other systems

QuickBooks remains the accounting source. Google Calendar supplies availability when connected. Neither overrides Homeworks job dates. This scheduling change does not alter those integrations.


## Validation

- TypeScript typecheck and production build passed.
- All 13 focused scheduling regression tests passed.
- Rollback-only database checks passed for source stop-order projection/removal and complete, atomic route reordering; partial/duplicate payloads left the route unchanged.
- Full browser suite: 814 passed, 2 mobile voice-control click timeouts. Both failed cases passed when rerun unchanged with one worker. No voice code was changed.
- Live Homeworks GraphQL read accepted the event route-stop fields and exact-event filter.
