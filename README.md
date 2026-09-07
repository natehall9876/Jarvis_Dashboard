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
    calculations.ts         Production rate, gross profit, labor cost %, etc.
    format.ts / utils.ts    Formatting + class-name helpers
    env.ts                  Central env var reading + "is this configured" checks
  types/
    database.types.ts       Hand-authored, shaped like `supabase gen types typescript` output
    domain.ts                Convenience aliases + joined view-model types
  mock/                     Clearly-labeled fake data for local UI dev — never imported by the app
```

## Database

`src/types/database.types.ts` is a best-effort schema based on the tables
described in the project brief (clients, properties, services, employees,
routes, service_agreements, route_stops, jobs, job_employees, time_entries,
equipment, job_equipment, equipment_maintenance, quotes, quote_items,
invoices, invoice_items, payments, expenses, job_materials, job_photos,
integration_mappings). Once your live schema is confirmed, regenerate it with
the Supabase CLI and nothing else needs to change:

```bash
npx supabase gen types typescript --project-id <project-id> --schema public > src/types/database.types.ts
```

## Integrations

The Settings / Integrations page never marks an integration "Connected"
unless Jarvis has actually verified it (currently: Supabase, via a live
query). Everything else — Homeworks, QuickBooks, Zapier, Google Calendar,
Weather, GitHub, and the AI provider — reports "Needs Setup" once credentials
are present in the environment, and "Not Connected" otherwise. Wiring up the
real sync/OAuth flows for those is the next phase of work.

## Security

- No Supabase service-role key is read or used anywhere in this codebase.
- All Supabase access goes through the publishable (anon) key, scoped by
  row-level security in the database.
- Third-party API keys (`AI_PROVIDER_API_KEY`, `HOMEWORKS_API_KEY`, etc.) are
  server-only environment variables, never `NEXT_PUBLIC_`-prefixed, and never
  sent to the browser.
