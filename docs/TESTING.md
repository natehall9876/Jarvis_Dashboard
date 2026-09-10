# Testing

## What exists today

**CI** (`.github/workflows/ci.yml`): on every push/PR to `main`, runs
`npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`. No secrets
required — the app is designed to build and boot without live credentials
(verified locally by running a full build with `.env.local` removed).

**E2E** (`e2e/unauthenticated.spec.ts`, Playwright): three tests, run against
both desktop Chromium and mobile Safari (`iPhone 14` viewport/UA):

1. Visiting a protected route with zero session cookies redirects to
   `/login`.
2. `/login` renders the real form (email, password, submit).
3. Submitting invalid credentials shows a real inline error instead of
   crashing.

Run locally: `npm run test:e2e` (needs `npx playwright install` once, and a
running dev server or let Playwright start one — see `playwright.config.ts`).

**This suite already caught a real bug**, not a hypothetical one: a
completely fresh, cookie-less visitor to `/` was not being redirected to
`/login` — `src/proxy.ts` treated `AuthSessionMissingError` (a distinct,
unambiguous "there was never a session" error) the same as a transient
refresh-token race error, and skipped the redirect for both. RLS meant no
real data was ever exposed (every query came back empty for the unauthenticated
role), but the owner-facing gate itself wasn't firing. Fixed by
distinguishing the two error names; verified by rerunning the same test.

## What does NOT exist yet, and why

**Authenticated E2E coverage** (Command Center, client → property → job
drill-down, Schedule, Jarvis, write-action confirm/cancel) is not in this
suite yet. It needs a real test Supabase account, and no test credentials
exist in this environment — inventing fake ones or hardcoding a real
password into a spec file would be a worse outcome than not having the
coverage yet. **To add it:** create a dedicated test-only Supabase Auth user,
store its email/password as GitHub Actions secrets (`E2E_TEST_EMAIL`,
`E2E_TEST_PASSWORD`), and add a Playwright `storageState` setup project that
logs in once and reuses the session across the authenticated specs.

**Deterministic safety tests** for the write-action architecture (propose
cannot mutate, invalid type rejected, stale proposal rejected, duplicate
execution prevented, etc.) were verified manually and extensively this
session — live, against real dedicated test records, including genuinely
concurrent duplicate-confirmation requests — but are not yet codified as
an automated test file. The manual verification is described in
`docs/CURRENT_STATE.md`; turning it into `execute.spec.ts`-style
unit/integration tests (calling `executeProposedAction` directly with
hand-built `ProposedAction` fixtures, no LLM involved) is the natural next
step and doesn't need any credentials beyond the same Supabase project the
app already uses.

**Golden owner-question scenarios** (a fixed set of real owner phrasing with
expected tool usage / grounding / confidence behavior) do not exist as a
committed file yet. A representative sample was tested live this session
(see conversation history / `docs/CURRENT_STATE.md`), but a permanent
`docs/GOLDEN_SCENARIOS.md` capturing them as reusable regression scenarios
was not written this session — flagged as a next-session task rather than
rushed.

## Running everything

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npx playwright install   # first time only
npm run test:e2e
```
