# Jarvis — WeedEater Lawn Care

Owner operations dashboard built with Next.js 16 App Router, React 19,
TypeScript, Tailwind CSS and Supabase. Use the existing repository;
production is https://jarvis-dashboard-fawn.vercel.app.

Current verified integration evidence and access limits are in
[the October 3 audit](docs/INTEGRATION_AUDIT_2026-10-03.md).
Historical progress entries are timestamped observations, not current counts.

## Run locally

Use Node 24 (production's configured version) and npm.

```sh
npm ci
cp .env.local.example .env.local
npm run dev
```

On Windows PowerShell, use npm.cmd/npx.cmd if script execution policy blocks
the .ps1 launchers. Do not change the machine's execution policy.

The dashboard requires NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. OAuth token stores, automatic Homeworks sync and verified schedule write-through
also require server-only SUPABASE_SERVICE_ROLE_KEY. Never use a service-role
key in NEXT_PUBLIC_* or commit environment files.

## Architecture

- src/proxy.ts refreshes the session and protects dashboard navigation.
- src/lib/supabase/server.ts uses the user's session and RLS for business data.
- src/lib/supabase/admin.ts is restricted to protected OAuth stores, the
  automatic Homeworks worker and verified Homeworks schedule write-through.
- src/lib/data contains business reads; src/lib/actions contains mutations.
- src/lib/ai uses those same data/action paths. AI write proposals require
  explicit confirmation and revalidation before execution.
- src/lib/integrations contains provider adapters, OAuth, automatic projection,
  source write-through and read-only reconciliation; legacy import writers are retired.
- Settings distinguishes configuration, stored authorization and a verified
  provider read. A stored token or imported customer count is not proof of
  current external connectivity.
- Job photos use the private job-photos bucket and signed access.

Supabase schema and RLS are live, not inferred from SQL file existence.
jobs links to a customer through properties.client_id; it has no client_id.
The capitalized Properties table is separate and is not used by Jarvis.
Historical SQL files must be compared with the live schema before applying;
do not blindly rerun them or loosen owner restrictions.

## Integrations

| Provider | Implemented behavior | Verification |
| --- | --- | --- |
| Homeworks | Direct OAuth PKCE + GraphQL; automatic five-minute projection, read-only reconciliation and verified schedule write-through | Legacy imports/webhook upserts are retired in the pending ownership release; see docs/CURRENT_STATE.md |
| QuickBooks | OAuth, refresh, company/customer/invoice/payment reads and financial preview | Verify company info; existing production authorization on file as of Oct 3 |
| Google Calendar | OAuth, calendar selection and paginated read-only event preview | No authorization on file as of Oct 3; owner setup/consent needed |
| Weather | National Weather Service | Live location lookup |
| AI | Server-side provider calls with business context | Configuration alone is not verification |
| Zapier outbound | Dispatcher exists | No automatic outbound event call sites wired |

QuickBooks uses Intuit's accounting scope, which permits writes at the
provider level; Jarvis's adapter implements reads only. Calendar requests
calendar.readonly. Calendar events are not copied into the job schedule.

Required provider variable names:
HOMEWORKS_OAUTH_CLIENT_ID and HOMEWORKS_SYNC_SECRET for automatic Homeworks sync;
HOMEWORKS_WEBHOOK_SECRET only preserves authentication on retired legacy routes;
QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET;
GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET.
ZAPIER_WEBHOOK_URL is independent of Homeworks OAuth.
Local and Vercel production environment scopes must be checked separately.

## Verification commands

```sh
npm run typecheck
npm run lint
npm run build
npm run verify:no-client-secrets
npm run test:e2e
```

See [TESTING](docs/TESTING.md) for isolated tests versus live persistence
tests. Live writes require dedicated test records and explicit test config.

## Security and limits

Business data is protected by live owner RLS policies using app_members.
OAuth token tables have RLS enabled with no browser-read policies. Token
values never belong in UI payloads, logs, model context or committed files.
Server code must authenticate before privileged token-store access.

OAuth refresh is coalesced within one server process; it is not a distributed
lock. Full unattended synchronization is not yet enabled. Homeworks remains
the CRM; QuickBooks accounting and Calendar previews remain separate.
