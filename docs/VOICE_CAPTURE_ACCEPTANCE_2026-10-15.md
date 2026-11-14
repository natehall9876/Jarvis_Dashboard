# Voice capture cancellation — October 15, 2026

Nate requested work to make Jarvis useful and usable. Inspection started from
main `89da51b3aae81be66b7ebfb219e6899c865cd2b4`, the current checklist, and the
October 10–12 voice/navigation handoffs. The existing draft PR #1 was preserved.

## Acceptance and confirmed failures

The Stop listening control must discard late transcripts, release the listening
state immediately even when the browser omits `onend`, and permit a new tap.
Typed requests must release capture before fetching an answer. An active
hands-free session must resume once after typed requests and navigation.

Three new regressions failed against main: stopping could execute a final
navigation transcript, an engine without `onend` left listening active, and
typed questions fetched with capture still active. Capture is now invalidated
before stopping the engine. Shared cancellation prefers abort and falls back to
stop when abort is missing or throws; it is also used for hang-up and completed
transcripts. Late callbacks cannot affect a new capture session.

Review identified a related typed-navigation restart gap introduced by releasing
capture. A fourth regression reproduced it before the route-completion restart
was added. Two further tests cover missing/throwing abort during hang-up.

## Verified locally

- Full isolated integration/recovery suite: **582 passed**, including six added
  capture regressions. These execute actual provider callbacks with controlled
  browser boundaries; no physical microphone or customer records are involved.
- Typecheck, full lint, production build, and whitespace checks passed.
- Client-secret scan: 37 built client JS files checked, no server secret references.
- Existing synthetic Homeworks ownership/sync/schedule database gates, activity,
  intelligence, and native-insert gates passed.
- Independent review's typed-navigation finding was fixed and re-reviewed;
  final review reported no actionable findings.
- Remote main remained at the base commit immediately before packaging.

Installation initially failed to download the pinned hand-tracking model through
Node networking. Downloading that same asset and running the repository's
checksum-verifying postinstall completed successfully. A restricted build was
stopped while awaiting network access; the subsequent permitted build passed.
No dependency or model version changed.

## Delivery and remaining limits

Prepared on `fix/voice-capture-cancellation-20261015` for a draft pull request.
This record establishes local implementation and verification, not deployment
or signed-in production acceptance. No business records, credentials, provider
settings, permissions, or operator pause state changed.

Next acceptance after release: physical iPhone Stop/retry, typed interruption,
and repeat hands-free turns. Natural neural audio, phone-call behavior, fresh
Homeworks change tracing, QuickBooks authorization, and the recorded October 17
Anthropic-key expiry follow-up remain separate unresolved requirements; this
patch does not claim to complete them. Current provider access and deployed key
identity were not checked in this pass.
