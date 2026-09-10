# Trial Runbook — how to open and test Jarvis

This is the exact, current way to run Jarvis locally and try everything that's
actually built. Nothing here is aspirational — if a step doesn't work, that's
a bug to report, not a documentation gap.

## 1. Prerequisites

- Node.js (whatever version is already installed — the project doesn't pin one)
- npm
- A `.env.local` file in the project root (see below)

## 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in real values for at
least the required ones. **Never commit `.env.local` or paste its values
anywhere — it's already gitignored.**

| Variable | Required? | What it unlocks |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required** | The app shows nothing real without this |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Required** | Same — this is the anon key, safe to expose client-side |
| `AI_PROVIDER_API_KEY` | Optional | Jarvis's AI answers. Without it, Jarvis explains it isn't configured instead of failing |
| `AI_PROVIDER_MODEL` | Optional | Defaults to `claude-sonnet-5` if unset |
| `WEATHER_LOCATION_LAT` / `WEATHER_LOCATION_LON` | Optional | Command Center weather card (National Weather Service, no key needed) |
| `HOMEWORKS_API_KEY`, `QUICKBOOKS_CLIENT_ID`/`SECRET`, `ZAPIER_WEBHOOK_URL`, `GOOGLE_CALENDAR_CLIENT_ID`/`SECRET`, `GITHUB_TOKEN` | Optional | Not yet wired to real functionality — see Settings page for honest status |

The Supabase URL/key are the **anon (publishable) key**, never a service-role
key. There is no service-role key anywhere in this codebase.

## 3. Install and run

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**.

To verify the build itself (what actually ships):

```bash
npm run typecheck
npm run lint
npm run build
```

All three should pass clean. If they don't, that's a real regression.

## 4. Login

- The login page is at `/login`. Access is invite-only — an account must
  already exist in Supabase Auth (Authentication → Users in the Supabase
  dashboard). There is no public sign-up.
- Enter email + password, submit. A wrong password shows the real Supabase
  auth error inline on the login page.
- On success you land on Command Center (`/`).
- Refreshing any page keeps you signed in — the session cookie is refreshed
  by middleware (`src/proxy.ts`) on every request.
- "Sign out" (top-right) ends the session and returns you to `/login`.

## 5. What to try first

The fastest way to see what's real:

1. **Command Center** (`/`) — today's schedule, business pulse (including the
   two production-rate numbers — see `docs/ARCHITECTURE.md`'s Data Trust
   section), priorities, weather, and the AI Owner Advisor panel, all live
   from Supabase.
2. **Clients → a client → a property → a job** — click through. Every arrow
   in that chain is a real link to a real record.
3. **Schedule** (Day/Week toggle) — real jobs, clickable into job detail.
4. **Open Jarvis** (the green sparkle button, bottom-right, on every page) —
   ask "Give me my owner briefing" or "What needs my attention?" from
   Command Center, or open it from a specific job/client/invoice/quote page
   and ask something about that record ("Was this job profitable?").

## 6. Testing Jarvis's intelligence

With `AI_PROVIDER_API_KEY` set, ask real questions:

- "Give me my owner briefing."
- "What needs my attention?"
- "How does Friday look?"
- "Who owes me money?"
- "What's our field production rate? What's our true paid rate? Why are
  they different?" — this should explain the difference between revenue per
  on-site job hour vs. revenue per every clocked crew hour, not just spit
  out one number.
- Ask a follow-up like "Which of those have work coming up?" — it should use
  the prior answer as context, not treat the question as unrelated.

Without `AI_PROVIDER_API_KEY` set, every Jarvis question should return a
clear "No AI provider is connected yet" message — never a crash, never fake
data, never a generic error.

## 7. Testing voice

The mic button sits next to the input field inside the Jarvis drawer.
Supported in Chrome, Edge, and Safari (the Web Speech API). If your browser
doesn't support it, clicking the mic shows an inline message saying so —
it should never silently fail.

Speaking a question fills the input live and auto-submits on the final
transcript, through the exact same path as typing. **A spoken proposal still
requires an explicit tap on Confirm** — no transcript, including one
containing the word "confirm," executes anything by itself.

## 8. Testing a safe action (do this on a TEST record, not real customer data)

1. Create a throwaway test client (e.g. name it something obviously fake like
   "ZZZ Test Client") via Clients → Add Client.
2. Add a property to it, then a job to that property.
3. Open that job's page, open Jarvis, and ask something like "Move this to
   next Friday."
4. Jarvis should show a **Proposed Change** card (current value struck
   through, arrow, new value, a Confirm and a Cancel button) — not claim the
   change already happened.
5. Click **Cancel** — verify nothing changed (reload the page).
6. Ask again, click **Confirm** — verify the field actually changed and the
   page behind the drawer updates without a manual reload.
7. Scroll to the job's **History** card — once `activity_log` is migrated
   (see `docs/CURRENT_STATE.md`), this shows the change with a timestamp.
   Until then it shows an honest "No activity recorded yet" instead of an
   error.

Supported actions right now: reschedule a job, change a job's status,
assign/change its crew, create a new job. Nothing else is wired to write
yet — invoices, quotes, clients, etc. are read-only through Jarvis.

## 9. What's real data vs. test data

Every seeded client/property/job in this database is realistic demo data
for WeedEater Lawn Care, not fake placeholder numbers hardcoded in the UI —
it comes from real Supabase queries. Anything you see prefixed `ZZZ-` was
created during agent testing sessions as a deliberately-labeled throwaway
record; safe to delete, or leave as an obvious non-customer for future
testing. `src/mock/` in the codebase is never imported by any real page —
confirmed, not assumed.

## 10. Known limitations right now

- `activity_log` and `action_requests` tables are defined in the codebase
  (fully typed, app degrades gracefully) but **not yet applied to the live
  Supabase database** — see `docs/CURRENT_STATE.md` for the exact SQL to run.
- Only 4 Jarvis write actions exist (reschedule, status, crew, create job).
- No employee-facing view yet — this is an owner-only tool right now.
- No QuickBooks/Homeworks/Google Calendar integration is live — Settings
  honestly shows each as not connected.

## 11. Stopping / restarting

`Ctrl+C` in the terminal running `npm run dev` stops it. Re-run `npm run dev`
to restart — the session cookie survives a server restart (it's stored in
your browser, not in server memory).

## 12. If Supabase, AI, or Weather isn't configured

The app is designed to degrade honestly, not fake it:

- **No Supabase config**: pages show a "Supabase is not configured" state
  instead of data or a crash.
- **No AI key**: Jarvis says so plainly instead of answering.
- **No weather coordinates**: the weather card doesn't render fabricated
  conditions.

Check `/settings` at any time for a live, verified connection status of
every integration the app knows about.
