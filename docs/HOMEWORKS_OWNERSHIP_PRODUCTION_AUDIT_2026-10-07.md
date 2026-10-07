# Homeworks ownership: production read-only audit — 2026-10-07

**Current drift result: no mismatches found in the retained source projections. Production enforcement was still missing at the time of this audit.**

Project: `pmxzldcltkfjkmtatvlu`. Repository baseline: `3466b8a`.
Observation window: **2026-10-07 02:38:01.536194–02:42:56.338041 UTC**.
Each production diagnostic used `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY` and `COMMIT`; the observed connection user was `postgres` and `transaction_read_only = on`. These were separate consistent snapshots within that window, not one snapshot across the entire window. The reusable script uses one read-only transaction.

**No production rows, schemas, grants, functions, fixtures, or configuration were changed. No rollback mutation tests were run in production.** This report describes production before the proposed ownership migration. It does not assert that the proposed migration was deployed.

Reproduction: [`scripts/homeworks-production-drift-audit.sql`](../scripts/homeworks-production-drift-audit.sql). It returns counts and minimal identifying details for any detected issues. It compares contact/address/source-note values inside SQL without returning those values or raw customer payloads.

## Current drift counts

| Check | Affected rows |
| --- | ---: |
| Local payments on Homeworks invoices | 0 |
| Local payments on Homeworks clients, including payments without a source invoice | 0 |
| Local-only jobs on Homeworks properties | 0 |
| Local properties on Homeworks clients | 0 |
| Local invoices on Homeworks clients/properties | 0 |
| Local quotes on Homeworks clients/properties | 0 |
| Local invoice items under Homeworks invoices | 0 |
| Local quote items under Homeworks quotes | 0 |
| Recurring service agreements touching Homeworks properties/services | 0 |
| Source-field mismatch rows across clients/properties/jobs/invoices/quotes/payments/services/employees | 0 |
| Source line-item mismatch/missing/extra rows | 0 |
| Homeworks projections without retained source records | 0 |
| Retained source records without projections | 0 |
| Incorrect/null `projected_id` pointers | 0 |
| Retained payload `id` inconsistent with its `homeworks_id` | 0 |
| Unresolved source customer/property/invoice/service references | 0 |
| Clients marked `homeworks`/`homeworks_sync`/`homeworks_import` without source IDs | 0 |
| Missing/extra source crew assignment rows | 0 |
| Route-order mismatches for events carrying `routeStops` | 0 |
| Homeworks payment external-reference mismatches | 0 |

There are **no currently affected UUIDs/Homeworks IDs to list for these checks**. Historical enrichment entries below are listed separately and are not counted as current drift.

## Projection comparison coverage

The expected values were derived from the **actual deployed** `public.homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)`, not from assumptions about the source API or the current working tree. Its `md5(pg_get_functiondef(...))` was `485e73e84f4620b7845ed3949fad9066`.

| Source entity | Projection | Compared rows | Mismatched rows |
| --- | --- | ---: | ---: |
| customers | `clients` | 71 | 0 |
| estimates | `quotes` | 2 | 0 |
| events | `jobs` | 233 | 0 |
| invoices | `invoices` | 26 | 0 |
| items | `services` | 6 | 0 |
| payments | `payments` | 7 | 0 |
| properties | `properties` | 26 | 0 |
| users | `employees` | 2 | 0 |
| Invoice line items | `invoice_items` | 101 | 0 |
| Estimate line items | `quote_items` | 2 | 0 |

All **373** retained top-level records have corresponding projections and correct projection pointers. The child comparison covered **103** line items. It compared parent linkage, service linkage, description, quantity, unit price and total. All **233** event payloads carried `routeStops` and their mapped `stop_order` matched.

The scalar comparison includes all fields assigned by the deployed conflict-update branches:

| Projection | Compared source fields |
| --- | --- |
| `clients` | `first_name`, `last_name`, `email`, `phone`, `status`, `data_source`, `homeworks_status`, `homeworks_deleted`, `homeworks_notes` |
| `properties` | `client_id`, `property_name`, `street`, `city`, `state`, `zip`, `active`, `homeworks_status`, `homeworks_deleted`, `homeworks_notes` |
| `services` | `name`, `description`, `default_price`, `default_budgeted_hours`, `active`, `homeworks_status`, `homeworks_deleted` |
| `employees` | `first_name`, `last_name`, `email`, `phone`, `active`, `homeworks_status`, `homeworks_deleted` |
| `jobs` | `property_id`, `service_id`, `scheduled_date`, `scheduled_start_time`, `price`, `budgeted_hours`, `status`, `completed_at`, `crew_size`, `homeworks_status`, `homeworks_deleted`, `homeworks_notes` |
| `invoices` | `client_id`, `property_id`, `invoice_number`, `status`, `invoice_date`, `due_date`, `subtotal`, `tax`, `total`, `amount_paid`, `sent_at`, `homeworks_status`, `homeworks_deleted`, `homeworks_notes` |
| `quotes` | `client_id`, `quote_number`, `status`, `subtotal`, `tax`, `total`, `accepted_at`, `homeworks_status`, `homeworks_deleted`, `homeworks_notes` |
| `payments` | `client_id`, `invoice_id`, `amount`, `payment_date`, `payment_method`, `homeworks_deleted`, `homeworks_notes` |

Important mapping details were preserved exactly: customer phone prefers nonempty `cell`; property street joins nonempty address lines; the deployed deletion predicate checks all four deletion markers; status translations match the function; event service uses only the first source line item; WAITLISTED event dates map to null; timed visits require `hasTime`; invoice/estimate notes use the function's literal backslash-n separator. Payments use the deployed deleted/refund amount behavior.

`payments.external_reference` is assigned only on insert by the deployed function, so it was checked separately against `homeworks:<id>`; all seven matched. `payments.homeworks_status` is not assigned by that function and was not falsely treated as a mapped field.

## Fields outside the current projection mapping

- All 71 Homeworks clients have `preferred_contact_method = 'sms'`, which is the schema default. The deployed projector does not assign it. This is not evidence of a user edit.
- All 71 Homeworks clients have null `company_name`.
- 48 Homeworks jobs have nonnull Jarvis `notes`. Notes are a permitted native field and were not compared against source `description`; source description maps to `homeworks_notes`. No note text was retrieved.
- No Homeworks jobs have `route_id`, `service_agreement_id`, `actual_hours`, `completion_notes`, or `started_at` set.
- No Homeworks invoices have `paid_at` set. No Homeworks quotes have `property_id`, `valid_until`, `sent_at`, or `declined_at` set. These are not conflict-update fields in the deployed projector.
- No sourced invoice items have `job_id` set. No sourced quote items have nonnull `budgeted_hours` or `is_optional = true`.
- Crew consistency covered 233 jobs, but there were **zero source users and zero projected assignment rows**. It proves absence of crew drift in this dataset, not successful synchronization of a nonempty crew.

## Historical alternate-writer evidence

`activity_log` contains eight `source = 'owner'`, `event_type = 'homeworks_enriched'` entries dated **2026-09-25 01:59:15.545744–01:59:18.901512 UTC**. Each reports fields `service` and `budgeted_hours`. These records document an owner-labelled enrichment path historically used on the jobs below. **Every current source-owned field on these jobs matches the retained Homeworks payload.** The log does not prove an independent owner edit, a present discrepancy, or who last changed the current value.

| Job UUID | Homeworks event ID | Current date/status | Activity UUID |
| --- | --- | --- | --- |
| `1c6fe33b-b27c-4481-9615-8d8e946a3249` | `57158555` | 2026-10-09 / scheduled | `a9d3a79e-5652-494d-a1e5-455c1df20b17` |
| `4ed9c726-0729-4b79-b999-30a23a558f9c` | `57158502` | 2026-10-12 / scheduled | `df98de82-ceaf-4d49-8ad8-df24932da1cb` |
| `6e88a03c-837b-4c22-a45c-20010ab1b1c6` | `57158808` | 2026-10-08 / scheduled | `7655bb92-f1c0-4c45-b1e2-e9e523010f84` |
| `7f1d32a1-cc35-46eb-88ee-4828a339a297` | `57158871` | 2026-10-12 / scheduled | `0fa03d4c-8055-4a33-9348-224b325cda25` |
| `bca90bca-184c-4632-ac7b-69c3ab4f3228` | `57158786` | 2026-10-08 / scheduled | `b94ba070-4bcc-42bc-aaf2-0701c30b13b1` |
| `c2cc8ee7-97a3-464e-a3ac-8cdc4d412eac` | `57158771` | 2026-10-08 / scheduled | `a01cf72d-cd7f-4955-b92b-2e8190969861` |
| `c78abb0a-8ead-49ea-b841-95d67c624974` | `57158797` | 2026-10-08 / scheduled | `8c60cf7d-1fa9-40a4-9169-db2128b48b81` |
| `d81826ca-fe83-44db-b524-853d60c69eda` | `57158568` | 2026-10-12 / scheduled | `a271bb8d-de56-4c70-b557-185b5db69315` |

The remaining grouped activity evidence was 25 system-labelled customer webhook syncs, 26 property webhook syncs and 19 job webhook syncs on September 25, plus one manual client data-source classification on October 2. That manual entry did not join to a currently Homeworks-owned client. The activity log is not a complete row-change history, so an absence of log entries cannot establish that a local edit never happened.

## Observed production permissions and write surfaces

The 12 relevant relations `clients`, `properties`, `jobs`, `quotes`, `invoices`, `payments`, `services`, `employees`, `invoice_items`, `quote_items`, `job_employees`, and `service_agreements` all had RLS enabled and identical table grants:

| Grantee | Exact table privileges on each of the 12 relations |
| --- | --- |
| `anon` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |
| `authenticated` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |
| `service_role` | `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` |

Each of these relations had exactly these two policies:

| Policy | Mode | Role | Command | USING / WITH CHECK |
| --- | --- | --- | --- | --- |
| `authenticated_full_access` | PERMISSIVE | `authenticated` | ALL | `true` / `true` |
| `owner_access_guard` | RESTRICTIVE | `authenticated` | ALL | Active owner membership / same |

The exact restrictive expression, in both USING and WITH CHECK, was:

```sql
(EXISTS ( SELECT 1
   FROM app_members m
  WHERE ((m.user_id = ( SELECT auth.uid() AS uid))
     AND (m.role = 'owner'::text) AND m.active)))
```

Therefore ordinary authenticated **active owners** were permitted to mutate all row fields; the policies did not enforce Homeworks ownership. The table grant alone does not show anonymous row access through RLS. Separately, the `TRUNCATE` grants are a database capability outside row-level policy enforcement and need explicit removal from ordinary roles; this audit did not attempt a truncate or any other mutation.

`anon` and `authenticated` had `rolbypassrls = false`; `service_role` had `rolbypassrls = true`. All three had public-schema USAGE and lacked public-schema CREATE. `authenticator` was a login role with INHERIT and BYPASSRLS both false.

Only `set_updated_at()` triggers existed on relevant scalar projection relations: `clients`, `properties`, `jobs`, `invoices`, `quotes`, `services`, and `employees`. `service_agreements` also had its timestamp trigger. There were **no ownership triggers** on any relevant relation. `payments`, `invoice_items`, `quote_items`, and `job_employees` had no user triggers.

Other mutation surfaces in the actual foreign keys: deleting a service can set `jobs.service_id`, `invoice_items.service_id`, and `quote_items.service_id` to null; deleting an employee cascades to crew assignments; deleting a service agreement sets a job's agreement link to null; deleting a property cascades to service agreements; deleting an invoice/quote cascades to its line items. Any ownership boundary must cover the resulting child operations. No such operation was executed here.

## Complete public function inventory

All six functions were owned by `postgres`, and **all were SECURITY INVOKER**. No public SECURITY DEFINER function was present.

| Exact signature | EXECUTE ACL grantees | Search path | Observed behavior |
| --- | --- | --- | --- |
| `homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)` | postgres, service_role | empty | Lease-checked source projection plus retained records/state |
| `homeworks_claim_lease(text,uuid,integer)` | postgres, service_role | empty | Insert/update lease, maximum requested duration 300 seconds |
| `homeworks_release_lease(text,uuid)` | postgres, service_role | empty | Delete matching owner's lease |
| `save_route_stop_order(uuid,jsonb)` | postgres, authenticated, service_role | empty | Owner-checked update of `route_stops.stop_order`; validates active route and complete unique stop list |
| `search_business(text)` | postgres, authenticated, service_role | public, pg_temp | Read-only stable SQL search |
| `set_updated_at()` | PUBLIC, postgres, anon, authenticated, service_role | public, pg_temp | Trigger updates only NEW.updated_at |

Each listed grant is EXECUTE without grant option, granted by `postgres`. Full function definitions were read to establish this inventory and the exact source transformation. No routine was invoked. Function fingerprints:

| Function | MD5 of runtime definition |
| --- | --- |
| `homeworks_apply_page(uuid,text,text,jsonb,jsonb,boolean)` | `485e73e84f4620b7845ed3949fad9066` |
| `homeworks_claim_lease(text,uuid,integer)` | `331017b9e2f7eb9b1d9c9d0fc1734b51` |
| `homeworks_release_lease(text,uuid)` | `79b1432cad2a23239136f88518e9e2a9` |
| `save_route_stop_order(uuid,jsonb)` | `105cf8f3fd356ab8f3d5c61cc7c5e4b8` |
| `search_business(text)` | `7e3f7dea45460f20c66580c72264b1e9` |
| `set_updated_at()` | `1c3ea071de62c54b535847a852367632` |

The production catalog thus showed no callable public definer bypass. The ordinary table privileges, missing ownership guards and cascading child mutations remained the relevant live enforcement gaps.

## Sync health at the structural snapshot

At **2026-10-07 02:39:09.580348 UTC**, all **21** streams had `failure_count = 0`, no `last_error`, and no in-progress cursor. Their most recent successful starts were approximately four minutes old:

| Stream | Last successful start, UTC | Last full start, UTC |
| --- | --- | --- |
| `customers_false` | 2026-10-07 02:35:01.819 | 2026-10-06 15:20:02.287 |
| `customers_true` | 2026-10-07 02:35:02.087 | 2026-10-06 15:20:02.886 |
| `properties_all` | 2026-10-07 02:35:02.306 | 2026-10-07 02:35:02.306 |
| `items_false` | 2026-10-07 02:35:02.703 | 2026-10-07 02:35:02.703 |
| `items_true` | 2026-10-07 02:35:03.138 | 2026-10-07 02:35:03.138 |
| `users_false` | 2026-10-07 02:35:03.275 | 2026-10-07 02:35:03.275 |
| `users_true` | 2026-10-07 02:35:03.515 | 2026-10-07 02:35:03.515 |
| `events_false` | 2026-10-07 02:35:03.627 | 2026-10-07 02:35:03.627 |
| `events_true` | 2026-10-07 02:35:05.269 | 2026-10-07 02:35:05.269 |
| `estimates_false_false` | 2026-10-07 02:35:05.395 | 2026-10-06 18:30:04.992 |
| `estimates_false_true` | 2026-10-07 02:35:09.379 | 2026-10-06 18:30:05.22 |
| `estimates_true_false` | 2026-10-07 02:35:09.491 | 2026-10-06 18:30:05.337 |
| `estimates_true_true` | 2026-10-07 02:35:09.635 | 2026-10-06 18:30:05.616 |
| `invoices_ACTIVE_false` | 2026-10-07 02:35:09.748 | 2026-10-06 18:45:11.546 |
| `invoices_ACTIVE_true` | 2026-10-07 02:35:09.863 | 2026-10-06 18:45:12.003 |
| `invoices_DELETED_false` | 2026-10-07 02:35:09.98 | 2026-10-06 18:45:12.13 |
| `invoices_DELETED_true` | 2026-10-07 02:35:10.243 | 2026-10-06 18:45:12.279 |
| `invoices_CASCADE_DELETED_false` | 2026-10-07 02:35:10.354 | 2026-10-06 18:45:12.41 |
| `invoices_CASCADE_DELETED_true` | 2026-10-07 02:35:10.465 | 2026-10-06 18:45:12.555 |
| `payments_false` | 2026-10-07 02:35:10.576 | 2026-10-06 15:20:09.265 |
| `payments_true` | 2026-10-07 02:35:10.689 | 2026-10-06 15:20:09.775 |

The previous 24 hours contained **136 success runs, zero other statuses**, spanning 2026-10-06 15:20:01.043484 through 2026-10-07 02:35:00.974950 UTC. The latest run completed at **02:35:10.813 UTC**. Their summed `records` counter was **605**; this is a worker change counter, not 605 unique business records. `homeworks_sync_failures` contained zero rows.

All source records had projections. No stale cursor, error-bearing stream, or missing projection was observed. Source `changed_at` is not a last-seen timestamp: the function only updates retained records when payload content changes. Old `source_updated_at` or `changed_at` values are therefore not independently evidence of a stale sync.

## Limits and verification

This is a database comparison against retained `homeworks_records`, not an independent fetch from the live Homeworks API. It cannot prove the retained payload is the latest possible source state, detect a record absent from both source cache and projections, or establish completeness outside the worker's synchronized scope. Stream health supports recent execution, not independent source completeness.

A zero current mismatch count does not prove a local mutation never occurred: later projection can restore source fields. Current values, timestamps, and an owner-labelled enrichment log do not justify attributing an updater. Fields absent from the deployed projection mapping were explicitly separated above.

Every diagnostic block in the accompanying script was executed successfully as a production read-only query. A draft reference-check query initially used the reserved CTE name `references`, failed at parse time, and was corrected to `unresolved` before successful execution. No production write was attempted in either query.

The absence of production drift does not satisfy the ownership-enforcement acceptance criterion. Local/test migration validation and deployment status belong to the implementation report; this audit neither deployed nor tested writes against production.
