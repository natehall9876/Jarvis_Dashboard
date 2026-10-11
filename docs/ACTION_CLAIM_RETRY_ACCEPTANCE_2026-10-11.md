# Action retry claim verification — October 11, 2026

Base: origin/main b1c0afb36eee1461e29b1fb738d6f5384667738b. Isolated branch fix/action-claim-race-20261011; the main and voice worktrees were preserved.

The previous reclaim path allowed a row already in executing and considered an error-free zero-row update a successful claim. Two requests that both observed failed could therefore execute the same action. The fix restricts the atomic update to the existing retryable terminal statuses and requires a matching returned ID. An already-running result no longer claims the action necessarily finished.

Verification on NatesPC:
- Before fix: the two new concurrency/zero-row regressions failed;13 other targeted tests passed. The concurrency case created two synthetic task IDs.
- After fix:15 targeted claim/ownership/confirmation tests passed. The real executor and Supabase query builder use isolated PGlite predicates; authentication, HTTP transport and task writes are fixtures.
- Type generation, TypeScript, changed-file ESLint, production build, client-secret scan (30 client JS files), and git diff --check passed.
- Independent Codex source review found no blocker for this narrow fix. This was not a Claude review.
- The first build failed because Turbopack forbids a node_modules junction outside its project root. Copied the existing dependency tree only after verifying identical package-lock files; the normal unmodified build then passed. No production credentials were copied.

No production deployment, live PostgREST/RLS contention, business-row mutation, phone or microphone test is claimed. No database migration, new action type, confirmation bypass or interface redesign is included.

Separate remaining source findings: a successful native task/note insertion followed by failed verification can still be released for retry; settled action receipts are not persisted in device conversation memory. This patch fixes claim contention only and does not claim exactly-once execution across every failure.
