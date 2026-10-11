# Jarvis Workshop and presence implementation

User approval: October 11, 2026, “implement all of that immediately, don't miss anything.” This authorizes the software brief from the two Age of Ultron recordings; it does not authorize hardware purchases or a new paid subscription.

## Boundaries

- Preserve the current dashboard and the merged hands-free voice lifecycle fixes.
- Add an optional Workshop. Business/source data remains read-only in these workflows.
- Represent observed system state, never invented neural activity or fake task progress.
- Distinguish implementation, configuration, deployed behavior and physical-device validation.
- No third-party messages, hardware purchases, or fabricated credentials.

## Work packages and interfaces

1. Voice: authenticated streaming preset neural TTS; cancellation and fallback; diagnostic status. `useJarvis()` adds `announce(text)`, `speechEngine`, `speechStatus` and actual `audioLevel`. Own provider/voice helpers and speech routes.
2. Presence: owner-scoped durable review queue; atomic leases and bounded deterministic reviews; persisted reminders and notification acknowledgement/snooze; preparation and travel estimates, quiet hours and event-version deduplication; opt-in Web Push and a secret-authenticated worker. Export `ActivityPanel` and `ProactiveNotifier`.
3. Workshop: authenticated real property/quote/job reads and comparison, saved device workspace, 3D core tied to provider state, pointer/touch controls, opt-in local camera gestures, reflected display and vendor WebXR adapters. Own Workshop route/components/helpers.
4. Integration/release: navigation, shell integration, dependency lockfile, new isolated-test registration, migration/scheduler availability, secret-boundary checks, final review, existing GitHub/Vercel release and production acceptance.

## Verification gates

- Existing voice lifecycle tests plus speech authentication, cancellation and failure tests.
- Reminder boundaries (time zone, overnight quiet hours, event updates, missing time/travel, dedup/snooze) and durable queue failure/retry/lease ownership tests.
- SQL RLS/role/grant checks in isolated PostgreSQL; no production fixture writes.
- Workshop absent/stale/error data, scope comparison, device persistence, gestures and renderer state behavior.
- Typecheck, lint, production build, client-secret check and relevant existing regressions.
- Inspect desktop/mobile reachable UI and new routes; separate synthetic checks from real microphone/camera/holographic hardware acceptance.

## Initial infrastructure evidence

- Base main: `b1c0afb36eee1461e29b1fb738d6f5384667738b`.
- Isolated branch: `feat/jarvis-workshop-presence-20261011`.
- Vercel target: existing `jarvis-dashboard`, WeedEater team; production domain `jarvis-dashboard-fawn.vercel.app`.
- Production environment inventory contains the existing Supabase and AI provider configuration, but no OpenAI speech credential, VAPID keys or Jarvis cron secret.
- Supabase connector currently returns no projects. Existing authorized CLI access is being checked before deciding whether migration deployment is blocked.

Implementation and validation outcomes will be recorded in `docs/JARVIS_WORKSHOP_ACCEPTANCE_2026-10-11.md`.
