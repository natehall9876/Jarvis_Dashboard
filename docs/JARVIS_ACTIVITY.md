# Jarvis background reviews and contextual reminders

The activity queue is durable PostgreSQL state. A cron invocation can process one read-only review and one opted-in owner's event refresh. Closing a browser tab cannot cancel a queued review. Reviews do not send customer messages, mutate business records, or call Homeworks writes.

## Deployment

Apply `supabase/migrations/20261011040419_jarvis_durable_activity.sql` through the project's normal migration deployment. It is additive and has been executed in PGlite with owner/employee RLS, lease recovery, result/error persistence, and notification deduplication tests. No live migration is implied by the presence of this file.

Server environment:

- `CRON_SECRET`: an independently generated secret of at least 24 characters.
- Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- `NEXT_PUBLIC_JARVIS_VAPID_PUBLIC_KEY`: browser-safe public key, available during build.
- `JARVIS_VAPID_PRIVATE_KEY`: server-only private key.
- `JARVIS_VAPID_SUBJECT`: a valid contact `mailto:` address or public HTTPS URL.

Schedule an authenticated GET or POST to `/api/jarvis/activity/worker` every minute with `Authorization: Bearer <CRON_SECRET>`. That exact route must bypass the cookie-based sign-in redirect, since its own secret authentication protects the cron caller. All other activity endpoints require a current authenticated active-owner account. `/jarvis-sw.js` must be public. Never reuse an integration webhook secret for this worker.

Supabase Cron can call this endpoint with `net.http_post` and an independently provisioned Vault secret. Provision the actual deployed application URL and secret before creating the cron job; do not paste credentials into this repository. Monitor the scheduled request's HTTP response and `jarvis_activity_preferences.last_checked_at`/`last_worker_error`. Environment presence alone is not proof that a scheduler is running.

Generate VAPID keys using the installed `web-push` package's `generateVAPIDKeys()` and place the output in deployment environment settings. Keep the private key out of clients, logs, and files committed to git.

## Acceptance

Run `node --test scripts/test-jarvis-background.mjs`, then typecheck and lint the changed modules. In an active-owner session, explicitly save background-review and reminder preferences, including preparation/travel estimates and quiet hours. Queue a review and verify `queued → running → completed` (or a persisted honest failure) with the tab closed. Reopen Workshop to view the timestamped source snapshot.

For reminders, use a designated test event in the selected Google Calendar or a real timed Schedule job. Date-only events never receive invented appointment times. Confirm preparation time equals source start minus the owner's estimates. Change/cancel the event and verify the next worker refresh replaces/removes the old notice. Confirm acknowledgement, ten-minute snooze, quiet hours, and no duplicated foreground speech across two tabs.

Enable push explicitly on a permitted browser/device. On eligible iPhones, use the installed Home Screen app. Server acceptance of a push request is recorded per device; it is not proof that the user saw the notification. Failure on one device is retried without resending successful device receipts. Closed-app speech is not supported. Notifications contain generic text rather than customer/event details on the lock screen.

## Limits and source safety

Business source tables model one shared company and do not have per-row tenant owner columns. Every worker source read verifies the persisted job/preference owner's current active `app_members` membership before reading a bounded shared-business source window. New activity records are explicitly owner-scoped, RLS-protected, and cannot be accessed by employees or other accounts.

Each read-only job has a 120-second atomic lease and at most three recovery attempts. Failed/interrupted work never becomes a successful result. The queue enforces at most ten reviews per owner per hour and one pending review per kind, including direct authenticated inserts. Source windows cap Schedule/collections at 500 records and reminders at 100 timed events; larger datasets fail honestly rather than publishing partial results.

Calendar reads use only the explicitly selected calendar on the connection recorded for the current owner. They run on the server, refresh expiring OAuth tokens with optimistic version checks, and never expose tokens to a browser. Calendar source failure preserves existing reminders but suppresses potentially stale delivery. Foreground reminder claims require a successful source refresh within three minutes, a matching event revision, and an unexpired event. Old event revisions and cancelled events remove obsolete notices. Each worker invocation has a 90-second internal budget; push fanout starts only when twelve seconds remain and uses bounded per-request timeouts.

Settings start opted out. In-app notices remain reviewable in Workshop. Foreground speech uses the same Jarvis `announce` path, respects mute and busy state, and requires speech opt-in. Push uses permission plus a saved device subscription, with a maximum of five devices, three retry attempts, and a five-minute retry delay. Successful per-device receipts are deduplicated. After an unavoidable process failure between remote acceptance and receipt persistence, a push may be repeated; the stable notification tag lets the browser replace the same notification.
