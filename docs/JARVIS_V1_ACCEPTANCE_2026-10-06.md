# Jarvis V1 production acceptance — 2026-10-06

> Historical evidence for the revision and date below. Current architecture, ownership rollout and sync status are documented in [CURRENT_STATE.md](CURRENT_STATE.md) and [DATA_AUTHORITY.md](DATA_AUTHORITY.md); these historical results do not verify the October 7 ownership changes.

Production: https://jarvis-dashboard-fawn.vercel.app

The operational dashboard is deployed and personally verified against real production data. **Full V1 acceptance is not complete:** QuickBooks denies production reads, Google Calendar lacks credentials/authorization, and physical iPhone microphone recognition remains unverified. Missing data is explicitly unavailable.

The approved af99a31a1d6114913586d1a368250808399bef9e was published and deployed. Completed Homeworks commits a1fe069c2e8ba9eadf0c9b9929af7778431f4ee4 and 503c75241cd0f66e848055c9269aff52a88e812b were merged without overwriting the parallel task. Combined operating code was verified at 3757b4f29347a75d64c773d2a00b68ef9bad6190, deployment dpl_UMd2HVEQiHPm2BCnmEbSQTgJtc41, READY and aliased to production. This cleanup removes only the temporary authenticated mobile test route and updates this record.

## Production acceptance

| Check | Result | Evidence / limit |
|---|---|---|
| Production URL and dashboard | PASS | Root, Schedule, Clients, customer detail, job detail, Leads, Money and Homeworks rendered without fatal errors. |
| Authentication | PASS, existing-session scope | Owner session survived navigation/reloads without a loop. Anonymous root returned 307 to /login?redirectTo=%2F; status API returned 401. Fresh password entry/recovery was not repeated. |
| Today | PASS | October 6 has no recorded jobs; verified empty schedule displays zero. |
| Weekly jobs/revenue | PASS | October 5–11: 15 jobs, $1,170 schedule value, 0 completed, 11.8 budgeted hours. Schedule, dashboard and independent Supabase query agree. |
| Service mix | PASS | 14 Grass maintenance jobs / $1,050; one Grass job / $120. |
| Customers/jobs/history | PASS | 25 current customers, excluding deleted placeholders. Jan Sparfven: property, recent jobs, $600 operational balance and eight completed history records. Real $75 job detail loaded on mobile. |
| Leads/estimates/next actions | PASS with data limit | Native leads table is empty; intake is explicitly unverified. Real estimates: $1,000 draft and $50 won, with next actions. Import timestamp now says Added to Jarvis, not source creation date. |
| Owner attention | PASS | Highest-value overdue balances, upcoming unassigned work, then draft estimate. One real AI query produced one bounded answer with eight record links. It asks to verify unfinished work rather than assuming completion. |
| Operational money | PASS | 19 Homeworks/Jarvis outstanding invoices total $5,165; four overdue total $1,025. Independently cross-checked. Explicitly separate from QuickBooks. |
| QuickBooks money/payments | FAIL — owner access blocker | Saved OAuth authorization can refresh, but company-info, invoice and payment reads return 403. UI records failed-read time and shows unavailable totals. |
| Google Calendar | BLOCKED — missing configuration | GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET absent from production and existing local environment; no saved connection. Events and calendar conflicts explicitly unavailable. |
| Homeworks automatic synchronization | PASS with evidence attribution | Parallel task witnessed real source change and revert through automatic runs into the open production UI. This task independently confirmed runs, restored source/native values and merged production UI. Exact evidence below. |
| Freshness | PASS | All 21 streams successful, no errors. UI checkpoint advanced automatically through 2:25, 2:30, 2:35, 2:40, 2:45 and 2:50 PM ET during acceptance. QBO/Calendar failures separate. |
| Mobile production | PASS at phone dimensions | Real authenticated pages in a temporary 390×844 frame without fixtures/data overrides: dashboard, customers/history, job detail, day/week Schedule, Leads, Money, Homeworks and conversation. Document width equaled scroll width (378 px excluding frame border/scrollbar); controls reachable. Weekly board intentionally scrolls inside its container. Temporary route removed after testing. Not a physical iPhone test. |
| Commands/duplication | PASS within scope | One open-money submission produced one navigation response; one attention click produced one answer. Duplicate recognition event regression passed in Chromium/WebKit. |
| Production microphone | PARTIAL — permission blocked | Start showed Listening / Stop listening; stop returned to idle without an empty command. Cloud browser denied microphone access; clear warning displayed. Physical spoken recognition is not claimed. |
| Runtime smoke | PASS for sampled flows | No fatal UI failures. Combined-deployment error/fatal log query returned no entries through 18:49:49 UTC; scoped observation, not a guarantee for future requests. |

## Verification and reliability

- Combined-source typecheck and production build: PASS.
- Latest V1/owner-data tests: 36/36 PASS. Includes unknown prices, demo/deleted records, schedule/database failure, failed crew reads, partial financial sources, stale/missing streams, recent-success-plus-sync-error, provider denial and unavailable Calendar.
- Prior voice + V1 run: 54/54 across Chromium/mobile Safari, including duplicate final-event prevention. Prior customer/financial run: 64/64. Microphone API is simulated in automated recognition tests.
- Modified-file ESLint: PASS. Client-secret scan: PASS (31 generated client JavaScript files after schedule correction).
- Parallel Homeworks task reports 176 targeted sync/OAuth/schedule/data/operations cases passing across Chromium/mobile Safari on its combined source.
- Earlier broad runs were not clean. A 208-case run had three timing-related voice failures; all six targeted project rechecks passed, then complete voice suite passed. An earlier entire default run had missing-browser/environment and Homeworks fixture failures. Final whole default suite was not rerun and is not claimed clean.
- Production was not deliberately broken to simulate outages or stale checkpoints. Those cases were verified at application boundaries. Real QBO denial, unconfigured Calendar and anonymous-auth rejection were observed live.
- Unknown capacity, unavailable lead conversion, complete business revenue/profit and unverified Calendar conflicts remain explicitly unavailable. Scheduled value is not collected cash.

## Exact Homeworks automatic change and revert evidence

The parallel task recorded this sequence in docs/HOMEWORKS_AUTOMATIC_SYNC.md:

1. Existing Homeworks customer **2955966**, Jarvis Integration Test, began with blank description; baseline source update 2026-09-22T17:54:08Z.
2. Real Homeworks description changed at **2026-10-06T18:30:27Z** to: Jarvis automatic sync acceptance 2026-10-06 — temporary reversible test.
3. Ordinary five-minute scheduled run **53a1f17a-7f52-4054-8bc4-3a2cb700b069** applied one changed record at **18:35:02.602066Z** and completed **18:35:12.099Z**, success.
4. Source mirror and native clients.homeworks_notes held the marker. The already-open production /homeworks?entity=customers page displayed it automatically, with **no manual import, explicit sync call, navigation or browser reload**.
5. Description restored to blank at **18:36:01Z**. Scheduled run **b775f326-10a5-4be5-928b-c96f04de332f** restored both layers at **18:40:02.278531Z**, completed **18:40:07.690Z**, one changed record. The same untouched page automatically removed the marker; counts stayed stable.

This task independently queried both run IDs: success, one record each, no error. It confirmed source updatedAt 18:36:01Z, changed_at 18:40:02.278531Z, blank source description and native note, with exactly one native customer. After merging, the live production customer card showed ID 2955966 updated at 2:40:02 PM ET with no marker. At 2:50 PM ET it showed a new successful run and 21 current streams. The source mutation was not duplicated.

## Isolation and publication

Work used branch fix/jarvis-v1-20261006 and isolated PC worktree C:\Users\nateh\Jarvis_V1_Verification. Canonical Homeworks files were inspected read-only. Each publication fetched main and required ancestry; when main advanced, completed Homeworks changes were merged normally. No force push or production business-record writes by this task. The workload relation now includes the existing client provenance field so the parallel task's production-only job filter operates correctly.
