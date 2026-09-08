# Jarvis — WeedEater Lawn Care Operations Dashboard

Jarvis is the operations command center for WeedEater Lawn Care: today's schedule,
business performance, clients, properties, jobs, routes, quotes, invoices,
employees, equipment, expenses, reports, and an AI advisor — all backed by a
real Supabase database, with architecture ready for Homeworks, QuickBooks,
Zapier, Google Calendar, and weather integrations.

## Stack

- Next.js 16 (App Router, Turbopack, React 19)
- TypeScript
- Tailwind CSS v4
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your Supabase project's public
   values (never the service-role key — this app never uses one):

   ```bash
   cp .env.local.example .env.local
   ```

   At minimum you need:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   ```

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Without Supabase configured, every page renders a clear "Supabase isn't
   connected yet" state instead of fake data — the app never shows numbers
   that aren't real.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Project structure

```
src/
  app/
    (dashboard)/          Route group for every nav page (shares the sidebar/topbar shell)
      page.tsx             Command Center
      schedule/            Day/week schedule
      clients/[id]/
      properties/[id]/
      jobs/[id]/
      routes/[id]/         Route stop order is editable (server action)
      quotes/[id]/
      invoices/[id]/
      invoices/payments/     All payments across every client/invoice
      employees/[id]/
      equipment/[id]/
      expenses/
      reports/
      ai-advisor/
      settings/            Integration status cards
    api/
      ai-advisor/route.ts  Calls the AI provider only if AI_PROVIDER_API_KEY is set
  components/
    layout/                Sidebar, topbar, mobile nav
    ui/                    Card, Badge, DataTable, StatTile, empty/error/loading states
    command-center/        Today's Mission, Business Pulse, AI Advisor panel
    ai-advisor/            Ask-the-advisor chat UI
    routes/                Editable route-stop list
  lib/
    supabase/              Browser + server Supabase clients (anon key only)
    data/                  All Supabase queries, one file per entity — returns
                            { data, error } instead of throwing, so pages can
                            render loading/error/empty states cleanly
    ai/advisor.ts           Builds a live-data context and calls the AI provider
    integrations/           Real (env-gated) Zapier + OpenWeatherMap calls
    calculations.ts         Production rate, gross profit, labor cost %, etc.
    format.ts / utils.ts    Formatting + class-name helpers
    env.ts                  Central env var reading + "is this configured" checks
  types/
    database.types.ts       Hand-authored, shaped like `supabase gen types typescript` output
    domain.ts                Convenience aliases + joined view-model types
  mock/                     Clearly-labeled fake data for local UI dev — never imported by the app
```

## Database

`src/types/database.types.ts` was reconciled against the **live** Supabase
project (queried via `information_schema` — see column names, nullability,
and foreign keys there) rather than guessed from the project brief. A few
things worth knowing if you're touching the schema:

- **`jobs` has no `client_id`.** The client is only reachable through
  `jobs.property_id → properties.client_id`. Every job query joins through
  `properties` to get client info.
- **No crew-lead concept.** Neither `jobs` nor `routes` has a crew-lead
  column — crew composition lives entirely in `job_employees`.
- **The database also has a capitalized `"Properties"` table**, distinct
  from `properties` (Postgres treats quoted-case identifiers as separate
  tables). It has a subset of the real columns and looks like leftover
  cruft from initial setup — Jarvis intentionally reads/writes only the
  lowercase `properties` table and never touches `"Properties"`. Nothing
  was dropped; if you confirm it's unused, it's safe to drop yourself.
- **`job_photos.storage_path`** is a Supabase Storage path, not a URL —
  `src/lib/supabase/storage.ts` assumes a public bucket named `job-photos`.
  Update `JOB_PHOTOS_BUCKET` there if yours is named differently or private.

If the schema changes, regenerate this file with the Supabase CLI and
reconcile any renamed/added columns the same way:

```bash
npx supabase gen types typescript --project-id pmxzldcltkfjkmtatvlu --schema public > src/types/database.types.ts
```

## Integrations

The Settings / Integrations page never marks an integration "Connected"
unless Jarvis has actually verified it (currently: Supabase, via a live
query). Two integrations are genuinely wired up beyond just status-checking:

- **AI Advisor** — calls Anthropic's API with a live business-data context
  once `AI_PROVIDER_API_KEY` is set (see `src/lib/ai/advisor.ts`).
- **Weather** — calls OpenWeatherMap for the Command Center weather card
  once `WEATHER_API_KEY`, `WEATHER_LOCATION_LAT`, and `WEATHER_LOCATION_LON`
  are set (see `src/lib/integrations/weather.ts`). Properties already have
  `latitude`/`longitude` columns, so per-route weather is a natural next step.
- **Zapier** — `src/lib/integrations/zapier.ts` posts real webhook events to
  `ZAPIER_WEBHOOK_URL` when called; no call sites are wired up yet (no events
  currently trigger it), but the dispatcher itself is real, not a stub.

Homeworks, QuickBooks, and Google Calendar report "Needs Setup" once
credentials are present, but stay short of "Connected" — those need an
actual OAuth flow and a place to persist tokens, which means a schema
decision (a new table) and OAuth app credentials neither of which exist
yet. Building those is the natural next phase.

## Security

- No Supabase service-role key is read or used anywhere in this codebase.
- All Supabase access goes through the publishable (anon) key, scoped by
  row-level security in the database.
- Third-party API keys (`AI_PROVIDER_API_KEY`, `HOMEWORKS_API_KEY`, etc.) are
  server-only environment variables, never `NEXT_PUBLIC_`-prefixed, and never
  sent to the browser.
