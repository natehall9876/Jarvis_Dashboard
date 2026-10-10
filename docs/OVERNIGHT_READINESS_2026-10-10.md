# Jarvis overnight readiness — October 10, 2026

Checkpoint: 03:15 America/New_York. Deadline: 07:00 America/New_York.
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
  The all-source checkpoint advanced to 03:10 Eastern. Current 5-minute automatic
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
- 508 isolated module/server-render/API tests passed. These include Calendar,
  QuickBooks, and Homeworks verification/reconciliation recovery cases.
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

PR #9 merged as e2e5e09060b7a76e28740300d2976c05760c4a84. Production
 deployment dpl_9DwkPV5NUjRaguTDTHG9s7TsDHEy is READY. Actual Calendar
preview succeeded after production reload at 00:46 Eastern.

## 01:10 QuickBooks recovery repair

Branch: fix/quickbooks-ui-recovery-20261010 in the same previously clean,
isolated worktree, based on current main. No credentials or records changed.

- Reproduced unhandled verification, preview and disconnect action failures;
  the failure message also lacked an accessible alert. Four targeted tests
  failed before the fix (six passed).
- Caught thrown requests with safe, retryable verification/preview messages.
  A lost disconnect response instructs a reload to check persisted state; it
  never claims authorization was removed. Successful disconnect still refreshes.
- Failure messages announce as alerts, success as status; Connect has a 44px
  minimum height. These are code checks, not physical mobile acceptance.
- Targeted tests now pass 10/10. Full isolated suite passes 499/499 across
  39 files. Typecheck, zero-warning lint, build, diff check and the 30-file
  client-secret scan passed. Synthetic tests use no real accounting writes.
- PR #10 merged as c9a47b21f669ef06d5b9e2bee2ec81811184adfb. Production
  deployment dpl_FzxvWkncPYiRZvxwwXkvWX66P8kQ is READY. A live read after
  reload showed the repaired accessible error state and the existing Intuit
  403 / 3100 authorization blocker. No accounting records changed.

## 02:06 Homeworks UI recovery repair

Branch: fix/homeworks-ui-recovery-20261010, cleanly based on current main.
No source records, authorization, or sync configuration changed.

- Reproduced five failures: thrown customer verification and day/range
  reconciliation requests vanished; uncertain disconnect retained stale success;
  and visible connection failures were not accessibility alerts.
- Added safe, retryable messages for verification and reconciliation transport
  failures. Uncertain disconnect now clears stale verification and instructs a
  reload to check persisted authorization without claiming success.
- Homeworks errors announce as alerts, success as status, and Connect has a
  44px minimum tap height. This is code coverage, not physical phone acceptance.
- Targeted suite moved from 5 failed / 1 passed to 6/6 passing. The complete
  isolated suite passes 505/505 across 40 files. Typecheck, zero-warning lint,
  build, diff check and the 30-file client-secret scan passed locally.
- PR #11 merged as 068bb6d8492c6f13b8eeb3f100a0faa20931eed4 after
  its exact-head CI passed, including synthetic database regressions.
  Production deployment dpl_49TWRtNFh73UQoB3EMS18oiCdfR3 is READY.
- After production reload, actual retrieval returned five Homeworks customers.
  The first read-only day reconciliation hit the concurrency guard, exposed an
  accessible retry message, used zero partial events, then succeeded on retry:
  one Homeworks job matched the same Jarvis event ID, zero were missing.
- That reconciliation also exposed one explicit QA/demo fixture as a false
  operational "extra"; no record was deleted or modified.

## 02:12 confirmed-demo reconciliation correction

Branch: fix/reconcile-demo-exclusion-20261010, cleanly based on PR #11 main.

- Added an explicit client data-source marker to reconciliation inputs and
  excluded only rows whose database provenance is exactly `demo`.
  Unverified and real records remain in reconciliation.
- The new targeted case failed before the change (one false extra) and the
  reconciliation range suite now passes 9/9. Full isolated suite passes
  506/506 across 40 files; typecheck, zero-warning lint, build, diff check and
  the 30-file client-secret scan passed.
- PR #12 merged as 4225b1b6c488752bb3911d8b95ab6b78a6e5e78f after its
  exact-head CI passed, including synthetic database regressions. Production
  deployment dpl_FawesmwynAUSm9Q4m6S71ppq5Rv8 is READY.
- The same deployed day reconciliation now reports one Homeworks job, one
  Jarvis job, one matching canonical ID, zero missing and zero extra.
- This is a read-only filter. No customer, property, job, authorization, sync
  configuration or production database row changed. Evidence:
  Jarvis-Homeworks-Reconciliation-Clean-2026-10-10.jpg.

## 03:12 legacy-history recovery and mobile hardening

Branch: fix/legacy-history-recovery-0310-20261010, cleanly based on current main.
No source records, authorization, sync configuration, or business data changed.

- A live production legacy-history read succeeded: 73/79 clients, 28/36
  properties and 234/256 jobs linked, with 20 recent activity entries and no
  recorded failures. It correctly labels retired webhook/bulk-import timestamps
  as Never and points to current automatic synchronization instead.
- The client still allowed a thrown Server Action request to escape without a
  recovery message. The check now catches that failure, shows an assistive-tech
  alert without raw exception details, and remains retryable.
- On narrow screens, the check control now spans the width with a 44px minimum
  tap height, the current-sync link has a 44px target, and the three counts stack
  until the small breakpoint. These are static responsive assertions, not a
  rendered-phone or physical-iPhone claim.
- Two new targeted cases pass; the affected suite passes 8/8. The full isolated
  suite passes 508/508 across 40 files. Synthetic database regressions,
  typecheck, zero-warning lint, production build and the 30-file client-secret
  scan passed locally.
- PR #14 merged as 652ff0ae1c8f97e39adad633dded1cd329140304 after its
  exact-head CI and Vercel preview passed. Production deployment
  dpl_CSUUiiFZ8VVzKkGTq6xP5KRUi3FF is READY.
- After production reload, the all-source checkpoint showed 03:10 Eastern and
  the live legacy-history read again returned the same linked counts, 20 recent
  activity entries and no recorded failures.

## 04:17 active-client audit and form-choice correction

Branch: fix/active-client-audit-0405-20261010, cleanly based on current main.
No customer, property, authorization, sync configuration, or database row changed.

- A live read-only production duplicate audit initially reported two possible
  phone-match groups. Source tracing proved each group was one active Homeworks
  customer plus one source-deleted Homeworks customer retained for history.
  The normal client table already excluded the deleted rows; the audit and
  form-choice loaders did not consistently honor the same deletion markers.
- The duplicate audit now checks only active, non-demo customers. Client choices
  exclude source-deleted customers, and property choices exclude both deleted
  properties and properties owned by a deleted source customer.
- Both regression assertions failed against the previous implementation, then
  passed after the minimal read-filter repair. The full isolated suite passes
  509/509 across 40 files. Synthetic database ownership/projection regressions,
  typecheck, zero-warning lint, production build, diff check and the post-build
  30-file client-secret scan passed.
- PR #16 merged as 3ce30f520602bffcb1a240c48585b733f43bfe43 after
  exact-head GitHub CI run 123 and the Vercel preview passed. Production
  deployment dpl_2zNPTdbenvtx2XL6JwHHNMooYKAQ is READY.
- After production reload at the 04:15 Eastern all-source checkpoint, the same
  live read-only audit reported no matching phone/email across 27 active
  clients. The source-deleted records remain available in Homeworks history.

## 05:08 owner-task recovery and mobile control

Branch: fix/task-card-recovery-0500-20261010, cleanly based on current main.
No task or other business record was created, completed, or changed during testing.

- The owner task card allowed thrown create/complete Server Actions to escape.
  Because a lost response can follow a committed write, an immediate blind retry
  could duplicate a task or repeat a completion request.
- Both actions now catch transport failures, show a safe assistive-technology
  alert without raw exception details, refresh server truth, and tell the owner
  to check the refreshed state before retrying. An uncertain create retains the
  typed draft; successful creation still clears it.
- The completion control is disabled while a task action is pending and its tap
  target increased from 32px to 44px. This is code/static-render evidence, not
  a rendered-phone or physical-iPhone claim.
- Three focused regressions failed against the previous component and then
  passed after the repair. The full isolated suite passes 512/512 across 40
  files. Synthetic database regressions, typecheck, zero-warning lint,
  production build, diff check and the 30-file client-secret scan passed.
- PR #18 merged as 7bd1a84cdc40b2529bd78bf841c72bae7cef3c3b
  after exact-head GitHub CI run 127 and the Vercel preview passed. Production
  deployment dpl_HJYk62f79PgUtxFcpQ2aZ83Ms8aS is READY.
- An authenticated production reload showed the deployed command center, the
  owner task inputs and empty-task state, plus Homeworks current / database
  reachable at the 05:05 Eastern all-source checkpoint. No production task
  action was invoked, so live create/complete persistence remains deliberately
  untested without a dedicated authorized demo record.

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

Next: inspect fresh concurrent work and continue only with demonstrated defects.
Do not repeat successful optional checks merely to increase test counts.
Keep mobile/voice and sign-in requirements visible in the final scorecard.
