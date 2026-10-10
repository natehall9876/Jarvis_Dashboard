# Jarvis overnight readiness — October 10, 2026

Checkpoint: 00:41 America/New_York. Deadline: 07:00 America/New_York.
Objective: finish Calendar OAuth and verify actual reads, then Homeworks health,
mobile usability, and broad regression coverage. Skip owner sign-in blockers
until the final handoff. Do not mistake passed automated tests for production
or physical-phone acceptance.

## Verified and completed

- Calendar OAuth credentials are saved as sensitive production Vercel variables.
  Owner authorization succeeded; a selected calendar persisted after reload.
  A real production event preview succeeded at 00:12 Eastern. Read-only scope.
- Homeworks production reports all 21 source streams successful, 73 customer
  source records and 234 scheduled-work source records (including source archives).
  The all-source checkpoint advanced to 00:35 Eastern. Current 5-minute automatic
  configuration is visible in production. No source record was modified for testing.
- Jarvis AI answered a real schedule question using the business snapshot.
  ChatGPT QuickBooks access works, but the separate Jarvis QuickBooks read is
  blocked by Intuit 403 / code 3100. Saved authorization is preserved.
- Public About, Privacy and Terms pages shipped in PR #8, merged as
  626de03a7362e370df84cc4b84dccc61d8313806. Production deployment
  dpl_AEukbwozo3m2emm9bzAyvs8PFae9 is READY.
- Anonymous production checks: the three public pages and login return 200;
  eight workspace/OAuth routes redirect to app login; health and AI requests
  return 401; an empty execute-action payload returns the expected 400.
  All 15 checks passed. The initial script incorrectly expected 401 for that
  malformed action; code inspection confirmed validation precedes execution.
- 494 isolated module/server-render/API tests passed. These include 9 new
  Calendar tests for Eastern/DST time, all-day dates, callback selection state,
  failure recovery, retry, and ambiguous write responses.
- Synthetic PGlite PostgreSQL tests passed: ownership/anti-spoofing, native
  overlays, idempotency, atomic checkpoints, dependency rollback, source invoice
  lines and timezone boundaries. No production database writes were used.
- Typecheck, lint (zero warnings), production build, diff whitespace and client
  secret scan passed. The scan examined 30 built client JavaScript files.

## This release

Branch: fix/overnight-readiness-20261010, isolated worktree:
C:\Users\nateh\Jarvis_OAuth_Branding_20261010.
Original checkout and its untracked screenshots were preserved.

- Calendar preview shows readable Eastern times with explicit EDT/EST.
- All-day dates retain their calendar date; invalid values remain unavailable.
- Callback confirmation reflects the saved selected calendar.
- Failed list/preview requests recover with retry; lost selection/disconnect
  responses instruct the owner to verify saved state without claiming success.
- Long calendar names/events wrap; Connect meets a 44px minimum tap height.
- Added repeatable credential-free `npm run test:isolated` (39 explicit files)
  and added it plus the synthetic ownership database regressions to GitHub CI.
- Removed one genuinely unused constant to clear the existing lint warning.

Release is awaiting GitHub checks/merge and production acceptance at this
checkpoint. A READY deployment alone does not verify the new Calendar UI.

## Blocked / explicitly unverified

- Google OAuth remains External / Testing. The saved refresh token can expire
  after seven days until appropriate publishing/verification is completed.
  Google Cloud Console is unavailable in the Work browser; owner configuration
  outside it is still needed. See GOOGLE_OAUTH_BRANDING_2026-10-10.md.
- Jarvis QuickBooks must be reauthorized by the administrator for the correct
  WeedEater company. A working ChatGPT connector does not prove Jarvis access.
- No representative phone viewport or physical iPhone was available through
  supported browser controls. Static mobile assertions passed; they do not
  count as rendered mobile or microphone permission/voice tests.
- Homeworks live reads/fresh checkpoints are verified. The entire trace of a
  newly changed source record through webhook/worker/persistence is unverified;
  do not edit a real customer/invoice/schedule just to manufacture proof.
- Live note/photo persistence requires a dedicated authorized demo record and
  secure test sign-in; no real business records should be used as test fixtures.

## Continuation

Seven bounded hourly Work runs are scheduled at 01:00–07:00 Eastern today.
At 07:00 provide the consolidated evidence and precise remaining owner actions.
Inspect repository/PR/deployment state before edits; preserve concurrent work.
Use current live sessions if available. Never request secrets in chat, weaken
security, send messages/payments, or delete business records.

Next: finish this PR, verify Calendar preview after production reload, then
exercise other reachable read-only desktop flows and only fix demonstrated bugs.
Keep mobile/voice and sign-in requirements visible in the final scorecard.
