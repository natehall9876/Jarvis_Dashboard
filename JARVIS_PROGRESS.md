# Jarvis Progress — Resumable Handoff

## September 23, 2026 — workflow recovery branch (not production)

Fresh remote main: `0baedae9961fcfae287c5f0d9a2a82ff9f123b92`; only main
was listed before this task. The four supplied recovery SHAs are unavailable
from GitHub and the cloned history. No recovery patches were found locally.

Branch `fix/jarvis-workflow-20260923` preserves login destinations on failure,
rejects external login redirects, and preserves note drafts with an inline
recovery message if a save response is lost. Added regression coverage and a
separate, opt-in real note/photo persistence suite with a designated demo-job gate.
See `docs/WORKFLOW_VERIFICATION.md` for exact access and verification boundaries.

Fresh checks: typecheck, lint, production build, and client-secret check passed.
New regressions: 6/6 passed after correcting a test alert locator and waiting for
the development fixture to hydrate. Full existing suite: 446 passed, 8 failed
(six Homeworks checks expect <500 but get the intentional 503 because no webhook
secret is configured; two mobile voice UI checks timed out). No assertions or
authorization were weakened to make those checks pass.
The complete mobile voice spec passed on a serial rerun (12/12); the original
full-suite failures remain recorded above rather than being relabeled as a pass.

Live Supabase anonymous reads returned zero rows for clients, properties, jobs,
job_notes, and job_photos. Direct project access works despite empty project
enumeration. Restrictive owner-access policies already exist, and the photo
bucket is private; all were preserved. No customer writes or database changes.

Desktop and phone-width browser checks verified login and note error recovery
using the existing development fixture, not authenticated live persistence.
No test login or designated test job was supplied. Vercel account access to
`weedeater` is denied (403). Nothing was merged or promoted to production.

---

**Last updated:** 2026-09-22, Phase I (photo deletion, voice command fixes, in direct response to the owner's real, signed-in test results).
**Production URL:** https://jarvis-dashboard-fawn.vercel.app
**Deployed commit:** `4fb69bd` — Vercel deployment confirmed `success` via its API, tied to this exact commit SHA.
**Repo:** natehall9876/Jarvis_Dashboard, branch `main`.

## THIS SESSION

**Verified fresh, not assumed:** deployment live (`37b43d7`, prior commit) and the secret-boundary fix both re-confirmed true from scratch before any new work started. Found and fixed a small stale doc comment (env.ts still credited the reverted `server-only` package).

**Photo deletion (was completely missing):** `deletePhoto` server action (photo id only, path always resolved server-side, single-owner auth matching every other action, DB-then-storage delete order for safe orphan handling, never throws) + `PhotoGrid` shared component (delete button, confirm, per-photo loading/error state, full-size lightbox preview) wired into Job/Property/Client detail pages, replacing three copies of duplicated grid JSX. Verified live in-browser (confirm dialog fires with the right text, declining blocks deletion) and with 3 new regression tests (deletion can never succeed without a real session).

**Voice — traced end-to-end, found 3 real issues:**
1. The "unsupported browser" message wrongly claimed Safari works — it doesn't on iOS/iPadOS (Apple platform limitation, not a bug), a very plausible actual explanation for "voice isn't working" if tested on an iPhone. Fixed the message.
2. Diagnostics had no way to see the actual transcript SpeechRecognition produced — added `lastTranscript`.
3. "Show me today's jobs" went to the generic unfiltered /jobs list, not /schedule (today's real view) — fixed. "Open the first job" had zero handling at all (singular "job" never matched the plural /jobs pattern, fell through to a meaningless entity search) — added a new deterministic `first_job` intent resolved against `getFirstJobToday()`, the exact same query/order the Schedule page itself uses. Verified end-to-end (real action call, no session → honest failure, no crash, no navigation).

"Add a note to this job" was verified already correctly wired (existing confirm-gated `propose_add_job_note` tool, page-context-aware) — no change needed.

**Homeworks import:** verified untouched (git history confirms no session this engagement modified it) and re-checked live Homeworks-side counts fresh via the GraphQL MCP: 25 active customers (matches every prior check, no drift), 26 properties. Could not re-verify the "47 deleted customers" figure from an earlier session — a fresh unfiltered query returns only the same 25, and an explicit `isDeleted: true` filter returns zero; not stated as current fact since it couldn't be reproduced this session, per instruction not to assume an earlier count is current. Jarvis-side synced counts still cannot be checked from this session (blocked channel from a prior session, not retried).

**Regression:** typecheck/lint/build/secret-check all clean; full Playwright suite 448/448 passing (up from 436 — 12 new tests, 0 weakened).

## STILL BLOCKED (same reasons as before, not retried)
- Supabase Auth Admin API (access-control question) — sandbox classifier denial from an earlier session, not retried.
- Jarvis-side live DB counts — same blocked channel; `SUPABASE_SERVICE_ROLE_KEY` is also blank in this local checkout.
- Real microphone / real iPhone testing — this sandbox's browser has mic access blocked at the pane level.
- Vercel runtime/function logs — no dashboard or CLI token access from this session.

## NEXT STEP
Owner: test voice again (should now show an honest, correct message if on iPhone, or actually navigate on Chrome/Edge/desktop Safari); test photo delete + preview; report back with what the diagnostics panel's "Last thing heard" shows if voice still doesn't do what's expected — that field is new this session and is the fastest way to find any remaining gap precisely.
