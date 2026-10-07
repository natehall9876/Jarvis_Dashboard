# Workflow verification — September 23, 2026

> Historical evidence for the revision and date below. Current architecture, ownership rollout and sync status are documented in [CURRENT_STATE.md](CURRENT_STATE.md) and [DATA_AUTHORITY.md](DATA_AUTHORITY.md); these historical results do not verify the October 7 ownership changes.

Fresh clone/fetch found only `main`, at `0baedae9961fcfae287c5f0d9a2a82ff9f123b92`.
GitHub returned no commit for `fac5a4c`, `1759c96`, `291a5aa`, or `422cb04`.
No recovery patch or bundle was available in this workspace. Existing fixes on
main were retained.

## Changes

- Failed sign-in preserves the requested job URL for the next attempt. Redirect
  destinations reject protocol-relative URLs and backslashes. Connection/setup
  exceptions return an inline error rather than crashing the login page.
- A lost note-save response retains the draft and explains that the owner should
  check saved notes before retrying (the write may have committed). Editing is
  disabled while saving so a successful save cannot erase newer unsaved text.
- Notes no longer show “No notes yet” alongside a read error.
- `e2e/workflow-recovery.spec.ts` covers login retry and lost-response recovery
  on desktop Chromium and iPhone-viewport WebKit, using the existing dev fixture.

## Real persistence test

`npm run test:persistence` targets the existing deployed app. It requires these
environment variables, supplied through a secure local environment or CI secrets:

- `E2E_BASE_URL`: the PR preview URL, with access through deployment protection.
- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`: an authorized test login.
- `E2E_TEST_JOB_ID`: an explicitly designated test job UUID.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the existing project.

The suite refuses missing configuration. Before writing, it authenticates and
requires the designated job's client to have `data_source = 'demo'`; it never
chooses a customer automatically. It signs in through the UI, verifies that client
and job links are visible, opens the job, saves a uniquely marked note and a tiny
test PNG, reloads, checks both the note and decoded photo, and independently reads
the persisted rows. It also tests anonymous table reads and photo download denial.
Runs are serial with no retries. Test rows remain for owner review; no records are
deleted. Traces/video/screenshots are disabled to avoid retaining login secrets.

This suite has **not completed a live persistence run**: no designated test job or
test login was supplied. Its missing-configuration guard was exercised and fails
explicitly. Browser WebKit emulation is not testing on a physical iPhone.

## Live access findings

Supabase project enumeration returned no projects, but direct access to the
documented project `pmxzldcltkfjkmtatvlu` succeeded. Read-only schema checks found
RLS enabled on clients, jobs, job_notes, job_photos, and app_members. Existing
`owner_access_guard` and `owner_photo_guard` policies are **RESTRICTIVE** and were
preserved. The job-photos bucket is private. These are newer than the repository's
single-owner-authenticated-role documentation; do not replace them using stale docs.

Direct anonymous REST reads of clients, properties, jobs, job_notes and job_photos
returned HTTP 200 with zero rows. No database, storage, or authorization settings
were changed, and no customer data was written.

GitHub reports successful Vercel deployment for baseline main. Vercel team
`weedeater`/project `jarvis-dashboard` is the existing deployment path. The connected
Vercel account returns 403 for that team: re-authentication to the `weedeater` scope
is required. The get_project connector also has an argument-schema error
(`idOrName` missing despite the exposed `projectId` input).

Local Chromium and WebKit verification found no horizontal overflow at 1440px and
390px, no uncaught page errors, and retained note drafts after an aborted request.
This is fixture recovery evidence, **not authenticated persistence evidence**.

Do not merge or promote to production until the owner approves.

## Checks actually run

- `npm ci`: passed, 0 reported vulnerabilities.
- `npm run typecheck`, `npm run lint`, `npm run build`, and
  `npm run verify:no-client-secrets`: passed (31 client JS files scanned).
- Targeted suite: initially 76/78; corrected the new test's ambiguous alert
  locator and hydration timing. New regression rerun: 6/6 passed.
- Full Playwright suite: 446 passed, 8 failed. Six failures are existing
  Homeworks tests expecting <500 while the unconfigured secret intentionally
  returns 503. Two mobile voice interactions timed out. Complete mobile voice
  spec rerun serially: 12/12 passed; this does not erase the initial failures.
- Persistence suite configuration check: intentionally failed for absent
  `E2E_BASE_URL`; no authenticated persistence test ran.
- Agent-browser CLI: Edge activation timed out and bundled Chromium CDP closed;
  browser verification used functioning Playwright Chromium/WebKit instead.
