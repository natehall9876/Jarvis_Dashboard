# Operations recovery — October 8, 2026

## Diagnosis and verified data

The 2:03 PM and 2:10 PM EDT Zapier alerts came from Zap 380407500,
"Homeworks new customer to Webhooks POST". Its old destination correctly
returns HTTP 410 because automatic Homeworks synchronization replaced that writer.
Do not reactivate the retired import path or report success without ingestion.

Read-only production inspection at 2:21 PM EDT found the independent
five-minute scheduler active, 21 healthy streams, and 288 successful runs
in the preceding 24 hours. Denis Canton and Carley Ferrara had reached
the retained source mirror and native client records automatically.
Carley's source note recorded Nate's unanswered October 8 call.
Denis's estimate meeting was projected for October 10 at 13:30 Eastern.
The end time was not verified in Homeworks.

At 2:34 PM EDT, all 21 streams were still fresh, the latest run had
succeeded at 2:30:10 PM, and each customer and the estimate had exactly one
matching source-linked projection. No manual import, business-row repair,
customer duplication, or schedule change was necessary.

## Session defect and fix

A production browser with an expired session could enter the dashboard
because proxy allowed unknown auth failures through. RLS then returned
anonymous results, showing misleading empty schedules and zero totals.
Prefetch requests also bypassed the gate entirely.

- Invalid or missing sessions now return to sign-in with the requested
  path and query preserved.
- Temporary auth failures return a non-cacheable recovery page with retry
  and sign-in options. They do not erase cookies or render business totals.
- Prefetch requests receive the same gate.
- API routes retain their existing authentication behavior; the automatic
  scheduler and OAuth callbacks are not redirected by the dashboard gate.
- The isolated test loader now initializes Next's Node environment before
  importing server modules, avoiding its fake AsyncLocalStorage fallback.

## Verification

- Regression cases reproduced the previous HTTP 200 fall-through; the
  original matcher failed the prefetch regression before the fix.
- 13 new session cases passed.
- 30 focused recovery/data-safety cases passed.
- Full Chromium and mobile Safari suite: 978 passed (no retries).
- Typecheck, production build, scoped lint, and diff whitespace check passed.
- Built-client scan: 30 files, no server-secret references.
- Tests used isolated dummy Supabase configuration, not production mutations.

## Related operational follow-up

The existing Operations Watch prompt now carries Nate's verified call outcomes
and Denis's booked estimate, preserving its read-only and deduplication rules.
It must not treat an unsent email draft as proof that Denis was never contacted.

Remaining access/configuration limits at verification:
- Zapier browser was signed out. Disabling only Zap 380407500 requires secure
  sign-in; its failed deliveries are already covered by the healthy replacement.
- Live authenticated Jarvis UI acceptance requires a valid owner session.
- Google Calendar has no stored Jarvis OAuth connection and its production
  client configuration is absent.
- Jarvis has a separate QuickBooks connection; present-day authorized provider
  reads were not verified in this signed-out session.
- Anthropic's October 8 email warns that the "Jarvis Dashboard" key expires
  October 9 UTC. A local provider credential still passed a read-only models
  request, which does not establish production-key identity or remove expiry.
- No Google Ads appeal or reinstatement is claimed by this change.
