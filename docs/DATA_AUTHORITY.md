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

The owner's October 6 correction was saved as 13 ordered property references. Homeworks initially contained 10 corresponding October 5 visits. After explicit owner approval, the three missing Grass Maintenance visits were created in Homeworks as OPEN, untimed visits:

- Richard Martin: event 59236775, $65, 1 budgeted hour.
- Richard Carbone: event 59236776, $65, 1 budgeted hour.
- Rayna Foster at 2 Penbryn Avenue: event 59236777, $50, 0.25 budgeted hours.

A fresh source read confirmed there were no duplicate visits before creation. The Homeworks mutation returned the correct customer, property, date, status and totals for all three. No invoices or customer messages were created.

## Other systems

QuickBooks remains the accounting source. Google Calendar supplies availability when connected. Neither overrides Homeworks job dates. This scheduling change does not alter those integrations.


## Validation

- TypeScript typecheck and production build passed.
- All 14 focused scheduling regression tests passed, including exclusion of archived routes and demo records from scheduling choices.
- Rollback-only database checks passed for source stop-order projection/removal and complete, atomic route reordering; partial/duplicate payloads left the route unchanged.
- Full browser suite: 814 passed, 2 mobile voice-control click timeouts. Both failed cases passed when rerun unchanged with one worker. No voice code was changed.
- Live Homeworks GraphQL read accepted the event route-stop fields and exact-event filter.

- October 6 at 21:45 UTC: the automatic worker completed successfully and projected the three approved Homeworks visits without a manual import. Their source IDs, October 5 dates, prices and labor budgets matched the mirror.
- Production Monday day view verified after reload: 13 actual appointments, $885 scheduled revenue, no missing-visit warning. Order: Jan Sparfven; Leslie Moreau; Richard Martin; Richard Carbone; Rob Elliot; Lizzie Farrell; Danny Dumican; Alicia Rathbun; Rayna Foster (2 Penbryn); Tara Zelano; Phil Hirons; Frank Sibilia; Roberts Grandma.
- Production route reordering was exercised through the UI, persisted across reload, restored to the owner order, and remained intact after automatic sync.
