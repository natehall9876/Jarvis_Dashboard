# Homeworks verification — October 7, 2026

Use [current state](CURRENT_STATE.md) for release status, [data authority](DATA_AUTHORITY.md) for the ownership contract, and the [October 7 production audit](HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md) for timestamped read-only evidence. The automatic worker is already deployed; the ownership migration/application changes are deployed, with evidence in the acceptance report. A stored OAuth authorization, a recent worker run and an independent provider read establish different facts.

## Read-only operational checks

1. Use the existing Jarvis deployment and owner session. Inspect variable names/scopes without exposing values: the worker needs server-only Supabase service-role access, Homeworks OAuth configuration and `HOMEWORKS_SYNC_SECRET` matching the scheduler's Vault secret. Do not create another integration or reconnect an existing valid account speculatively.
2. Open Settings and use the existing Homeworks Verify action. Record its timestamp and success/error, never tokens. Compare a read-only reconciliation/source view with Homeworks when independent freshness evidence is required.
3. Inspect `homeworks_sync_runs` and all 21 `homeworks_sync_state` streams: recent successful starts, no unexplained failures/stale cursor, and expected full-scan behavior. `homeworks_records.changed_at` records content changes, not every successful read; old changed_at alone is not stale-sync evidence.
4. Confirm the named five-minute scheduler and the secret-protected scheduled route configuration. Do not invoke ingestion to replace missing scheduler evidence. The browser status poll is a display refresh, not ingestion.
5. Run `scripts/homeworks-production-drift-audit.sql` only through a read-only diagnostic connection. Check its deployed projector fingerprint before relying on its mappings. It compares retained payloads/projections and emits counts/minimal identifiers without repairing anything.

The October 7 audit found zero current drift across 373 top-level source projections and 103 line items, but no installed ownership guards. Zero drift does not establish that source-owned writes are blocked or that retained data is independently complete at the provider.

## Legacy endpoints are retired

After the October 7 ownership deployment, `/api/integrations/homeworks/webhook` and `/import` preserve missing-secret 503/wrong-secret 401 and return 410 after successful secret authentication. `/admin-import` requires a session and then returns 410. These responses mean the old write path is retired, not that a delivery succeeded. Do not send real customer payloads, confirm manual imports, or create a test webhook record to verify the new architecture.

Isolated tests in `e2e/homeworks-webhook.spec.ts` and `homeworks-write-safety.spec.ts` exercise correct/incorrect auth, malformed and valid legacy payloads, stale confirms and the shared retired sink without database/source access. Historical webhook-labelled activity may also have originated from manual imports; preserve that ambiguity rather than relabelling old history.

## Isolated mutation regression

Run `npm run test:ownership:db`. The harness loads `scripts/fixtures/homeworks-production-schema-20261007.sql` into isolated PGlite, applies the ownership migration, runs synthetic authenticated/service-role/native-field/parent-lineage checks in rollback transactions, verifies rollback, and runs the existing sync/schedule projection regressions. No production business rows are copied. `npm run test:ownership:db -- --baseline` skips the migration and is expected to expose the original ownership gap.

This is distinct from production read-only diagnostics. Do not execute `homeworks-ownership-regression.sql`, the synthetic schema snapshot, or projection fixture scripts against production.

## Release verification

Only after the migration and application deployment are explicitly recorded should the new boundary be called live. Inspect installed trigger definitions/role privileges; confirm a subsequent ordinary automatic run, source projection and dashboard refresh. Verify owned views show “Managed in Homeworks,” invalid creation/payment/conversion controls are absent, native edits remain available where implemented, and retired AI action types are rejected.

Live schedule/status write-through changes Homeworks. Exercise it only within a separately authorized, designated test workflow, verify the source response and subsequent projection, and preserve the existing source-failure/no-local-fallback behavior. Mocked schedule tests and isolated projection SQL do not by themselves prove production provider credentials or a live source mutation.
