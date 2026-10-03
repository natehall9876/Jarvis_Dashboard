# Testing

## Standard checks

```sh
npm run typecheck
npm run lint
npm run build
npm run verify:no-client-secrets
npx playwright test --workers=2 --reporter=line
```

Use npm.cmd/npx.cmd on NatesPC PowerShell. Browser binaries must already be
installed, or install them with npx playwright install. The default suite
can start its own localhost:3000 dev server; avoid running a production
build against the same .next directory while that server is compiling.

## What the default suite covers

e2e includes pure domain/integration tests and browser tests in Chromium
and mobile Safari. Coverage includes Homeworks normalization, linking,
pagination, reconciliation, history/enrichment, webhook auth boundaries;
OAuth state/expiry/token handling; notes, tasks, photos, schedule/revenue,
voice, login redirects, section isolation and interrupted workflows.

integration-reliability.spec.ts exercises real server modules using the
load-server-module helper to replace only external auth/network boundaries.
It tests reconnect failure preserving old credentials, refresh persistence
failures, concurrent refresh coalescing, missing admin config, malformed
token responses, callback cookie scope, Homeworks provenance/completeness
and Calendar pagination/DST boundaries. The fixture values are synthetic;
these tests never read real tokens or write business records.

The voice-lab tests exercise isolated application components and mocked
browser APIs. They are not evidence of a signed-in production session or a
real microphone's behavior on the owner's phone.

## Live persistence suite

npm run test:persistence uses playwright.persistence.config.ts and
e2e-live/persistence.spec.ts. It requires E2E_TEST_EMAIL, E2E_TEST_PASSWORD,
E2E_TEST_JOB_ID, the public Supabase config and the configured app target.
The selected job must belong to a demo client before any note/photo writes
are allowed. It verifies reload persistence and anonymous read denial.
Do not substitute a real customer job. Credentials must remain outside git
and logs. This suite was not run during the October 3 integration audit
because no authenticated dedicated test setup was available locally.

## Evidence boundaries

A passing mocked provider test proves error handling and request behavior,
not that real credentials are accepted. A READY deployment proves deployment
health, not CRM freshness. Record fresh provider verification and database
observations with timestamps. See INTEGRATION_AUDIT_2026-10-03.md.
