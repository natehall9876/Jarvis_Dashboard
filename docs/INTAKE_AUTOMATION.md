# Draft-only business intake

Prepared November 13, 2026 for the requested Homeworks exit and AI tool setup.
This is a pure review stage for Jarvis, not a replacement CRM or a live inbox.

## Installed definition and current boundary

`automation/intake/draft-only-intake.n8n.json` is an importable, inactive n8n
subworkflow. An upstream workflow supplies one JSON envelope containing
`inquiries` and `existing_contacts` arrays. It returns one review item per
inquiry, retaining each raw input and its source identifiers. It performs no
network, filesystem, CRM, invoice, schedule or messaging actions. Draft text
is deterministic; no paid AI call is made.

`automation/intake/synthetic-demo.n8n.json` is a manual test workflow with
obviously synthetic contact data. It uses the same generated transform and
can be executed without credentials. Import it as a separate workflow and
click **Execute workflow**. The two example inquiries should both have a
duplicate contact hold. Neither creates a customer or sends a message.

The normalizer is compatible with n8n's Code node v2 and Execute Workflow
Trigger v1.1. The trigger explicitly accepts incoming data. The node schema
was checked against n8n's upstream source. Actual import and execution on the
installed n8n version must be recorded separately from the Node test result.
Importing a workflow does not connect Gmail, texts, QuickBooks or Jarvis.

## Input and output

See `automation/intake/input.example.json` for a synthetic envelope.

| Input | Meaning |
| --- | --- |
| `source`, `source_id`, `source_url` | Original provider/export and stable message or row identity. Do not replace this identity with a generated customer ID. |
| `received_at` | Original event timestamp including timezone. Missing or timezone-free values remain unknown. |
| `last_confirmed_at` | Optional source claim; retained as unverified, never inferred from processing time. |
| `name`, `phone`, `email` | Supplied contact details. Phone matching supports US/NANP numbers, not extension guessing. |
| `property_address`, `town`, `region`, `neighborhood`, `photo_refs` | Supplied property evidence. Region is required for a core-area flag. |
| `service_requested`, `message` | Request content, treated only as data. |
| `existing_contacts` | A read-only index of IDs, phone numbers and emails to compare; it is not modified. An empty array explicitly means no index was supplied. |

Results always begin as `needs_verification`. They include raw input,
normalized contact keys, duplicate candidates, missing fields, a rough
route-fit flag and draft text. `price`, `scheduled_at` and
`follow_up_due_at` remain null. The system does not accept a job or promise
a date, even when the incoming message requests one.

Matching phone/email keys only identify **possible** duplicates. Shared
numbers, family contacts and multiple properties require review. Both sides
of a within-batch match receive a contact hold; nothing is dropped or merged.
Names alone are never used to merge. Duplicate detection across separate
runs requires an updated contact/source index and a durable uniqueness check
in the eventual staging writer; this pure stage does not provide those.

Smithfield/Greenville, Rhode Island are marked as core-area candidates.
North Smithfield and Greenville in another state do not qualify. Esmond
receives an explicit excluded-area review flag. Exact travel distance,
neighborhood and existing route capacity still need verification. Mowing
remains weekly only; this workflow does not change service policy or create
appointments.

## Connection gates

| Source / destination | Required before live use | Current result |
| --- | --- | --- |
| Website inquiries | Confirm the intended form, authenticated transport, consented field mapping and provider submission ID. | No webhook exposed. |
| Gmail | Owner-authorized read access; choose the intended account and inquiry labels; retain message/thread ID. | No credential configured by this change. |
| Jarvis text collector | Verify current incoming/outgoing capture and importer status; retain sender, direction, body and time. | No collector access or repair claimed. |
| QuickBooks | Use existing read adapter; verify company and invoice identity. Outstanding balance is not inferred from a message. | No accounting write or connector change. |
| Master tracker | Authenticated staging-only writer, immutable originals, unique `(source, source_id)` handling, review history and owner access controls. | Output returned to caller only. |

These exports contain no credentials. Keep private records and execution
exports out of this public repository. Review n8n execution retention before
feeding it real customer information. Synthetic executions are safe to retain
for testing; real raw messages are business data.

## Homeworks exit handoff

Nate reported canceling Homeworks on November 13. The repository's October 7
architecture describes source-owned operational records protected by database
guards and source-first schedule writes. That is the implementation boundary,
not proof of current Homeworks access.

1. Preserve retained source payloads, projections, identifiers and backups.
   Verify the current last-successful sync and what records are actually
   available before changing the worker.
2. Build separate reconciled working records, retaining links to original
   Homeworks records and each new source. Keep current, historical, uncertain
   and needs-verification status distinct; ingestion time is not confirmation.
3. Review identity/property conflicts and invoices before promoting working
   records. Cross-reference old records; never erase source markers or create
   native children beneath protected Homeworks parents as a shortcut.
4. Implement and test a deliberate native-data transition with rollback and
   change history. Only then change source ownership, schedule actions and
   sync behavior. Destructive edits or irreversible transfers require Nate's
   approval of the concrete migration.

This change performs none of those production migration steps, removes no
guard, disables no worker, changes no invoice and does not overwrite the
separately developed master-tracker Site.

## Rebuild and verify

From the repository root:

```sh
node automation/intake/build-workflows.cjs
node --test automation/intake/prepare-review.test.cjs
git diff --check
```

The tests exercise duplicate/identity edge cases, exact source preservation,
Rhode Island route screening, uncertain timestamps, untrusted content,
draft-only results and the embedded n8n Code-node program. The workflow
exports are generated from `prepare-review.cjs`; regenerate after edits.
Node tests are not evidence of a live source-to-tracker integration.

Official references:

- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/
- https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/
- https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/ExecuteWorkflow/ExecuteWorkflowTrigger/ExecuteWorkflowTrigger.node.ts
