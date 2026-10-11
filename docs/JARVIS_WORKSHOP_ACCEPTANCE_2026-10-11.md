# Jarvis Workshop and presence acceptance — October 11, 2026

Scope: implement the approved two-clip film-study brief without replacing the dashboard, changing Homeworks-owned records, purchasing hardware or activating a new paid speech account.

## Delivered software

- Optional `/workshop`: real property/quote/job reads, two-option scope and price comparison, missing-data labels, editable assumptions and account-scoped device save/restore. Saved views refresh source records rather than persisting stale business facts.
- Branching Three.js core: actual session state, live capabilities during tool progress, recorded tools after completion, neural audio RMS, pointer/touch orbit and zoom, keyboard-accessible controls, reduced motion and phone low-power defaults.
- Explicit camera gestures: browser-local MediaPipe processing, pinch orbit/zoom/panel selection, permission denial recovery, track cleanup on hide/unmount/off. Runtime and model are served locally; model SHA-256 is verified at install.
- External display controls: fullscreen/core-only, Pepper's Ghost mirror, lazy Looking Glass WebXR setup/entry and headset XR. These are real rendering adapters, not proof of physical hardware output.
- Neural speech path: active-owner-only streaming PCM API, preset British delivery instructions, cancellation, bounded sentence segments, audio-unlock/suspension/watchdog handling and clear device-voice fallback. No actor imitation.
- Durable activity: three bounded read-only review types; queued/running/completed/failed records, atomic leases, stale-worker protection, retries, retained source failures and completion notifications.
- Preparation reminders: actual timed Schedule and selected Google Calendar events, explicit owner estimates, quiet hours, source refresh freshness, event revision checks, cancellation, snooze and deduplication.
- Opt-in Web Push: service worker, restricted push endpoints, per-device delivery receipts and failed-device retries. Closed-app spoken audio is not promised.

## Evidence

- Independent code reviews found and resolved stale reminder delivery, obsolete-notice starvation, stale-version acknowledgement, direct-insert queue limits, push fanout/runtime bounds, interrupted audio hangs, overlong speech and advisor prompts, and live-vs-recorded tool display.
- Feature commit `bb6f07a`: CI passed typecheck, lint, production build, client-secret check, isolated regressions, Homeworks ownership/sync SQL regressions and activity SQL tests.
- The same commit passed **553 isolated tests** on NatesPC (34 seconds). Focused suites include **28 voice checks**, **6 Workshop model checks**, and **9 activity checks** (the activity suite is separate from the 553).
- Activity tests execute the actual migration in isolated PostgreSQL/PGlite and exercise owner isolation, denied worker RPC access, lease recovery, failed-result persistence, source revision/freshness, malformed Calendar responses, quiet hours/DST, and per-device push retry receipts.
- Headless Edge on NatesPC rendered the actual Workshop component in the explicitly synthetic development harness. Property comparison, save/reload/restore, orbit/zoom buttons, reflection mode, reduced motion and 390-pixel no-overflow checks passed with no page exceptions. Desktop and mobile screenshots were inspected. This is browser acceptance, not a physical iPhone test.
- Production migration **20261011040419** (`jarvis_durable_activity`) is installed. All six new tables have RLS enabled. Privileged worker functions are invoker functions and deny ordinary authenticated/anonymous execution.
- Production CRON/VAPID variables and the matching Vault secret are provisioned. The named minutely scheduler is activated only after the worker deployment is ready.
- Next/ESLint were patched to 16.3.8. Compatible transitive runtime updates remove reported runtime advisories; `npm audit --omit=dev` reports zero advisories. This does not assert that every development dependency is advisory-free.

## Activation and physical acceptance

- No `OPENAI_API_KEY` is configured in production. Neural code is implemented; device speech remains the active fallback. A provider credential and an actual PC/iPhone listening test are needed before describing the premium voice as live or approved.
- Reminder estimates are editable and clearly identified as owner estimates, not measured travel. Preparation reminders and push require explicit preference/device opt-in.
- Camera hand tracking needs the owner's physical gesture trial; synthetic pointer checks do not prove gesture accuracy.
- Looking Glass/headset/reflection hardware output has not been tested. No device, Bridge installation or subscription was purchased.
- Saved Workshop state is account-scoped on the current device; it is not advertised as cross-device storage. Durable jobs, results, preferences and notices are server-side.
- Source reviews are bounded snapshots, not accounting verification or arbitrary autonomous investigations. Failed or oversized source reads remain failures.

Final production URL, release commit and live closed-tab review receipt are recorded in PR #24 and the subsequent release-verification entry.
