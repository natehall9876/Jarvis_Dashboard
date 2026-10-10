# Jarvis workspace upgrade — October 10, 2026

The command center now combines a typed command entry, the existing voice conversation, four on-demand operational reviews, and independent connection checks. Reviews cover operations, collections, sales and the next seven days. They use the authenticated advisor and its existing source tools. They are owner-triggered reviews, not unattended background agents.

Connection health distinguishes configuration, successful reads, missing setup and provider denial. QuickBooks must pass a company read, Calendar must pass an events read, and the AI badge only marks a completed business-tool answer as verified. Refresh failures and timeouts stay visible. The new health endpoint requires owner authentication and disables caching.

The advisor can read selected original Homeworks event fields for an already-known job. This preserves appointment titles and notes that can distinguish estimate visits from unpriced production work. Reads use the existing authenticated Supabase client and RLS; raw payloads and unknown fields are not returned. A separate connection-health tool exposes current provider checks and all Homeworks stream checkpoints.

Loading states, narrower layouts and touch targets are consistent across the workspace. Notes and command controls remain disabled until their client handlers are ready, preventing early input from being lost during loading. Homeworks browser status polling now times out instead of leaving future refreshes blocked.

## Observed external setup limits

Before release, Homeworks showed successful scheduled runs across all 21 streams. A live AI business-data request completed. QuickBooks company access returned HTTP 403 / Intuit 3100; reconnect reached an Intuit account-recovery page. Google Calendar application configuration was absent. These states are surfaced honestly and require provider/account setup before they can be marked verified. No credentials, production records, ownership guards or OAuth scopes were changed for this upgrade.

## Validation scope

Typecheck, lint, optimized production build and the client-secret reference scan passed. New tests cover independent provider errors, owner-only health access, source-field filtering, typed command submission, review execution, failure recovery and mobile width. The browser suite uses isolated development fixtures; it does not prove real microphone behavior or replace signed-in production verification.

Final regression run: 1,039 of 1,042 tests passed on the first complete run with public sign-in configuration; the remaining three voice-panel tests passed in a traced serial rerun. Development-server timing flakiness remains a test-harness limitation, so this is not recorded as a single clean 1,042-test run. The previously reproducible mobile note-input failure passed after the hydration guard. Browser tests used two workers, explicit localhost binding and webpack for the isolated Windows worktree.
