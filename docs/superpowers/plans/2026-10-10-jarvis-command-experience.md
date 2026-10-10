# Jarvis command experience — implementation brief

User instruction: start the Jarvis experience upgrade now, prioritizing visual polish and working results. Continue existing integrations and preserve unrelated mobile-nav work.

## Spec
- Graphite/cyan command console, responsive from phone to desktop, real briefing data, visible live state and reduced-motion support.
- Stop ends the current response, speech and hands-free loop. No cancelled/late response can execute navigation, restore action cards, or affect a new request.
- Progress names only real tool calls. Aborting browser streaming aborts upstream generation; no further tools start after cancellation.
- Last 20 completed conversations survive reopening for seven days on the same device, isolated by authenticated user. Restored responses are explicitly historical; no restored action confirmation cards. Clear forgets them. Voice mute preference survives too. Hands-free never auto-enables after reload.
- Current Anthropic integration remains the live AI provider. Browser voice is labeled honestly; no claim of realtime voice, background listening, cross-device memory or connected accounting while those aren't configured.

## Task 1 — request lifecycle
Add cancellation propagation through provider, advisor and authenticated SSE route; redact unexpected failures; real progress frames. Add focused transport tests first. Add a single active-request identity in the client, cancellable first-job lookup, Stop in drawer/dock/hero, and late-event guards. Verify provider + route/advisor tests and typecheck.

## Task 2 — durable context
Add bounded validated device storage and owner identity from authenticated layout; seven-day expiry, no stale proposals, old unscoped storage discarded. Save mute preference, label storage and historical context. Verify malformed/cross-owner/expired input and no resurrected actions.

## Task 3 — command interface
Implement stateful vector core, graphite/cyan hero, accessible 44px+ controls, mobile layout, honest progress and status. Preserve briefing and existing connections. Verify browser interactions, responsive layout and reduced motion.

## Task 4 — release
Fresh-context branch review, fix important findings, focused regression + typecheck/lint/secret scan/build. Reconcile latest origin, deploy existing Vercel project, verify production with authenticated browser and actual read-only question.

## Review focus
Cancellation race with new submit, clear and unmount; provider deadline; stream close/disconnect; memory owner boundary/TTL/schema; stale history mistaken for live facts; action-confirmation preservation; 375px layout and tap targets. Do not modify src/components/layout/mobile-nav.tsx.
