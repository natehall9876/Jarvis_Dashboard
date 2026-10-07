# Trial Runbook — how to open and test Jarvis

Use this guide for local checks. See CURRENT_STATE.md for pending ownership rollout, HOMEWORKS_OWNERSHIP_PRODUCTION_AUDIT_2026-10-07.md for read-only production evidence, and TESTING.md for automated/authenticated test boundaries.

## 1. Prerequisites

- Node.js 24 (matches current Vercel production)
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
| Integration variables | Per integration | See README.md and CURRENT_STATE.md; Homeworks automatic synchronization and all three OAuth adapters are implemented |

The public Supabase key is the publishable key. The separate service-role
key is server-only and must never use a NEXT_PUBLIC_ prefix. It is limited to
OAuth stores, automatic Homeworks projection and verified schedule write-through.

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
7. Scroll to the job's **History** card — this shows recorded changes with timestamps. The table was
   verified present live on October 3.

The confirmed AI actions are reschedule a job, change job status, add a job
note, create an owner task and complete an owner task. Job creation and crew
assignment proposals are removed. For Homeworks visits, schedule/status
confirmation writes through Homeworks first; local source edits are blocked.
Use independent local test records for the workflow above. Do not create a
local test job under a Homeworks property or use production customers as fixtures.

## 9. What's real data vs. test data

The live database contains both Homeworks-sourced records and demo records.
Use the clients.data_source classification and an explicitly designated
demo job for tests; never infer that a realistic name is fake. Do not
delete records merely because older documentation called them seeded.

## 10. Known limitations

- Homeworks sync runs automatically every five minutes. Manual imports/linking/enrichment and legacy webhook upserts are retired in the pending ownership release; reconciliation is read-only.
- Existing provider authorization needs a fresh Verify call before claiming
  live connectivity. Google Calendar has no authorization on file in the
  October 3 audit.
- Local credential availability differs from Vercel production.
- Homeworks automatic OAuth refresh uses a distributed lease; the other adapters retain their documented coalescing/version-check behavior.
- Owner-only tool: no employee-facing app is provided.

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

Check `/settings` for configuration, saved authorization, and explicit Verify actions. A saved authorization is not proof of current API access.
