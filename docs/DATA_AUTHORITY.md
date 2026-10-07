# Data authority — October 7, 2026

**Homeworks-owned records are read-only projections inside Jarvis.** Homeworks owns their operational state; Jarvis displays the projection and separately stores intentional native notes, hours and supporting data. A source-owned change must be saved in Homeworks and verified before Jarvis projects it.

**The ownership changes and migration `20261007030921_homeworks_ownership_guards.sql` are deployed.** The October 7 read-only audit found no drift before enforcement. Separate release verification then confirmed all 12 guards, exact tested function fingerprints and a successful subsequent scheduled run. See [current state](CURRENT_STATE.md), the [writer inventory](HOMEWORKS_WRITERS.md), and the [production audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md).

## Ownership

Homeworks owns customer identity/contact/status, property identity/address/relationships, source service definitions, source employee identity/contact/activity, recurring operational records, visits and their schedule/status/price/budget/crew, estimates, invoices, source payment state, and their line items. Fields without a current projection mapping are not automatically available for local editing: protected rows use an explicit native-field allowlist.

The database determines ownership from any source marker (`homeworks_id`, `data_source = 'homeworks_sync'`, nonnull `homeworks_status`, or `homeworks_deleted = true`), a retained `homeworks_records.projected_id`, or a protected operational parent. It checks both old and new row values, so clearing an ID or moving a child to another parent cannot erase ownership. Source identity fields themselves cannot be created or changed by ordinary application roles.

Parent ownership propagates from clients to properties/quotes/invoices/payments, properties to jobs/quotes/invoices/service agreements, invoices to payments/invoice items, quotes to quote items, and jobs to crew assignments. This prevents local-only jobs under a Homeworks property and local payments under a Homeworks invoice or client, including when the child has no source ID. Parent rows are locked while the database checks ownership to prevent concurrent linking races. A catalog `service_id` or employee reference alone does not confer parent ownership.

Independent Jarvis-native records with independent local parents remain writable. Creating a local child of a Homeworks operational parent is not an independent local workflow.

## Allowed native data on protected rows

| Table | Native business fields that may change locally |
| --- | --- |
| `clients` | `notes` |
| `properties` | `access_notes`, `service_notes` |
| `jobs` | `notes`, `completion_notes`, `actual_hours` |
| `quotes`, `invoices` | `notes` |
| `job_employees` | `hours_worked` on an existing assignment |
| `service_agreements` | `notes` |
| `employees` | `notes`, `hourly_rate`, `role`, `has_drivers_license`, `hire_date` |
| `payments`, `services`, `invoice_items`, `quote_items` | No native business-field exception |

Where present, ordinary `updated_at` maintenance is also allowed. Native `notes` are separate from read-only `homeworks_notes`. Source-owned and inherited-owned invoice/quote views provide notes-only editing; their actions validate submitted fields and reject changed source fields before writing only the submitted native notes. Native crew hours do not authorize adding/removing assignments. Jarvis also owns owner tasks, photos, equipment, activity/action history, integration health and AI state; their own authentication and relationship checks still apply.

## Trusted source writes

The existing five-minute automatic worker fetches source data and calls the service-role-only `homeworks_apply_page` RPC. That RPC projects clients, properties, jobs, quotes, invoices, payments, services, employees, source line items and crew assignments while recording the same page's checkpoint. The worker, source projection, OAuth coordination and scheduler are preserved by this ownership change.

Date/time and supported status edits to an existing linked Homeworks visit use `writeHomeworksSchedule`: check owner access, acquire the same sync lease as the worker, read the source event, mutate Homeworks, verify its response, and project that response. Supported source status changes are Scheduled, Completed, Cancelled and Skipped. Source failure leaves the local schedule unchanged. Projection failure after source success explicitly reports that Homeworks saved and automatic sync must catch up. An owned job without a usable source visit ID cannot take this write-through path.

Legacy manual customer/property/job imports, linking, enrichment, historical backfill, webhook upserts and exported-file imports are retired. Their server actions and old shared sink return an unavailable result without I/O. External webhook/import routes retain their secret checks and return HTTP 410 after authentication; the owner import route checks the session and returns 410. They do not trigger a worker run. Read-only comparisons can remain available.

The migration installs `SECURITY INVOKER` guards on 12 tables and permits projection writes only for the actual database `service_role`. A user-supplied JWT claim or session flag cannot enable this exception. This is a trusted server credential boundary, not a new generic admin-write capability for UI/AI code. Ordinary RLS owner checks remain in force. The migration also removes `TRUNCATE`, `TRIGGER`, and `REFERENCES` privileges from browser/public roles on these relations. It performs no business-row repair or deletion and does not rewrite `homeworks_apply_page`.

## Schedule and route order

- Homeworks supplies actual visits and dates, including cancellations/deletions. Its explicit route stop for the visit date wins for order.
- When source route order is absent, the owner's persisted active weekday route preference orders existing visits by property ID. It never creates appointments or revenue.
- A route stop without a visit produces a missing-visit notice and is excluded from confirmed workload/revenue.
- The Schedule, today's mission, workload and first-job lookup share date/effective stop order/time/stable-ID ordering. Demo and source-deleted jobs are excluded from operations.
- Route preferences save through the existing owner-authorized, RLS-scoped atomic `save_route_stop_order` function. It rejects stale membership and incomplete/duplicate payloads.
- Events are read each scheduled run because route changes need not advance event `updatedAt`. No customer-name list or recurring-job generator fabricates the schedule.

Historical October 6 verification recorded 13 actual Monday visits and $885 scheduled revenue after three explicitly approved visits were created in Homeworks and then projected automatically. That earlier source correction is not a change made by this ownership task; see the release history and [automatic-sync documentation](HOMEWORKS_AUTOMATIC_SYNC.md).

## Evidence and other systems

The [October 7 audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md) compared 373 retained top-level source records and 103 line items with the deployed projection mapping and found zero current mismatches or local operational children under source parents. It was read-only and made no repairs. It compared retained Homeworks payloads, not a fresh independent provider fetch; it cannot prove an alternate writer never changed a row before sync restored it.

QuickBooks remains the separate accounting integration; its current adapter reads provider financial data without writing these projections. Google Calendar supplies read-only availability when connected. Neither overrides Homeworks visits or payment projections. Local ownership regression, application verification, and deployment evidence must be reported separately from the production drift snapshot.
