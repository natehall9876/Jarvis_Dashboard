# Homeworks verification

Current evidence is in `INTEGRATION_AUDIT_2026-10-03.md`. Direct API access,
webhook receipt, stored records, and automatic scheduling are separate checks.
A saved OAuth authorization or populated customer table proves neither a
fresh API read nor continuing webhook delivery.

## Prerequisites

Use the existing production Jarvis project and an authenticated owner session.
The server needs `SUPABASE_SERVICE_ROLE_KEY`; direct OAuth also needs
`HOMEWORKS_OAUTH_CLIENT_ID`. Webhook ingestion needs `HOMEWORKS_WEBHOOK_SECRET`.
Check variable names and deployment scopes without printing values.
Historical handoff notes raised a webhook-secret rotation concern. Its current
rotation state was not verified in the October 3 audit. Resolve that history in
the existing Vercel and sender configuration before using it for a write test;
coordinate both ends so legitimate deliveries are not broken.

## Direct API, read-only first

1. Open Settings and use Homeworks **Verify**. Record success/error and time,
   never tokens. A stored authorization is not this check.
2. Preview the full customer/property sync, upcoming jobs, and reconciliation.
   Compare totals and dates with Homeworks itself. A failed schedule read must
   show unknown, not zero. A capped customer result cannot be confirmed.
3. Inspect proposed additions and updates. Confirm imports only after reviewing
   actual changes and source authority. Do not use real customer writes as a test.
4. Check sync status and distinguish manual imports from webhook receipts.

## Webhook authentication, no write

POST a deliberately invalid secret to the existing webhook route. A 401 with
an invalid-secret error proves only that the route rejects that request.
A 503 names missing server configuration. Neither proves valid delivery.
Never put the real secret in command output, a transcript, or a committed file.

## Valid delivery, dedicated test record only

Use the already configured sender, if one exists. Do not buy another service.
First inspect its trigger coverage and delivery history. Send a clearly marked,
owner-approved dedicated test record with a unique external ID. Check:

- Successful response and exactly one matching database record.
- An activity event with `origin: webhook` and `provenance_version: 2`.
- The same record is visible in the owner's Jarvis session.
- Repeating the same test event preserves the record ID and does not duplicate it.

Do not replay arbitrary real customer payloads or remove records during this
check. A test delivery verifies only that event shape, not every entity type.

## Automatic freshness

The repository has no scheduled full sync. Direct import, enrichment, job sync,
and reconciliation run only when requested. A webhook receiver cannot produce
events by itself; its sender must be configured and delivering each needed type.
Historical `homeworks_webhook_sync` labels are ambiguous because manual imports
used the same default before the October 3 fix. Version-2 provenance separates
new deliveries without rewriting historical records.

Before enabling recurring writes, verify current provider data and sender
coverage, deletion/cancellation behavior, and how Homeworks changes interact
with owner edits. Preview and preserve records until those semantics are clear.
