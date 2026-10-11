# Native insert reliability results

Base: 33c1d27932db52dff86321a59253056cd7caffbc. Local worktree only.

Changed files:

- src/lib/ai/actions/execute.ts
- scripts/test-native-insert.mjs
- NATIVE-INSERT-RESULTS.md

Native note/task inserts now supply a deterministic UUID (SHA-256 truncated to
128 bits, UUID version 8/variant bits) from a versioned namespace, authenticated
user ID, action type and action ID. Payload changes do not change this key.
Native action IDs are restricted to 1–128 ASCII letters, digits, underscores or
hyphens before claiming the action. Both insert paths require a current user.

The existing native primary key, rather than process memory or a preliminary
read, arbitrates insertion. Only 23505 proceeds to recovery; other returned
database errors remain failures. Both successful inserts and duplicate attempts
must read the exact ID and verify owner, source, relationship and validated
payload. A read error is unverified even if data accompanies it. Task recovery
also requires open status, no completion and no additional client/property link.
Conflicting rows are never overwritten.

Validation performed:

- node --test scripts/test-native-insert.mjs — PASS, 15 tests.
- npm.cmd run typecheck — PASS (Next route generation and tsc --noEmit).
- npm.cmd run lint — PASS.
- node node_modules/eslint/bin/eslint.js src/lib/ai/actions/execute.ts scripts/test-native-insert.mjs — PASS.
- git diff --check — PASS.

Tests transpile and execute the production executor, mocking only external
boundaries. The query adapter implements atomic primary-key uniqueness using a
shared Map and returns PostgreSQL's 23505 on duplicate inserts. Both paths cover:
committed insertion followed by read failure (including data plus error),
lost insert response, post-save logging exception, same-process retry, fresh
module/restarted attempt, independent concurrent attempts, changed payload,
foreign-owner row conflict, distinct authenticated-owner keys, missing auth,
invalid/bounded keys, and non-duplicate database errors. Edited/completed task
fixtures verify no overwrite and no false success. No database fixture or new
dependency is required for these isolated tests.

Tradeoffs and remaining limitations:

- The existing schema has no immutable original task-payload record. Recovery
  compares current validated fields conservatively; an edited/completed task
  fails stale and retains its edits. This is not an immutable historical proof:
  edits that later return fields to the exact original values cannot be detected.
  Append-only note intent is verified against its stored body and provenance.
- Rows previously inserted with random IDs cannot be retroactively recognized.
  No historical data is read, repaired or migrated.
- Deleting a native row (including cascade deletion) removes its uniqueness
  protection. Permanent deduplication after deletion would require a retained
  durable receipt/schema change, outside this narrow patch.
- Activity logging remains best-effort and is not deduplicated. A retry may add
  another timeline entry, but cannot add another native row with the same key.
  Injected logging exceptions exercise defensive retry behavior; the actual
  logger normally swallows its own errors.
- Authentication identity scopes the key: the same action nonce for another
  authenticated owner is a different operation, never recovery of the first
  owner's row. Existing database authorization/RLS remains authoritative.
- action_requests claiming/finalization and its memory fallback are unchanged.
  PR27 claim-race work is not reproduced here. The tests deliberately exercise
  the existing fallback to prove native insertion safety independent of it.
- Synthetic adapter results do not establish live RLS/database acceptance.
  No live database, external API, browser acceptance or deployment was tested.

Read AGENTS.md, CLAUDE.md, AI_GUARDRAILS, DATA_AUTHORITY, DECISIONS,
CURRENT_STATE, TESTING, ARCHITECTURE and installed Next server/client boundary
guidance before edits. Homeworks writes, confirmation flow and appearance are
unchanged.

Deployment status: NOT deployed. No commit, push, dependency installation,
external service contact, settings change or modification outside this worktree
was performed.


## Independent reviewer acceptance — October 11, about 04:04 Eastern

The installed PC queue completed the bounded implementation as its sixth completed job. A separate root reviewer inspected the production diff and added scripts/test-native-insert-db.mjs using the real existing migration and isolated PGlite PostgreSQL tables. No production data or credentials were used. The adapter serializes reads with PostgreSQL to_jsonb to match PostgREST date strings; this is a primary-key/behavior regression, not a live RLS or transport acceptance test.

All eight database regressions FAILED against unchanged origin/main 33c1d27932db52dff86321a59253056cd7caffbc: lost-read/lost-response and concurrent cases produced two rows; changed-payload reuse was incorrectly accepted. The same eight PASS with this patch. Initial harness setup issues (missing referenced fixture tables and driver Date-vs-JSON representation) were corrected before this baseline comparison; they are not counted as product failures.

Final local validation: 23/23 combined tests pass (15 adapter and 8 PostgreSQL), changed-file lint passes, diff whitespace check passes, normal Next16.3.8 production build passes, and client-secret scan passes (39 client JS files). Builder also ran typecheck and full lint successfully. Added npm run test:native-inserts and a CI step so regressions remain enforced. No new dependency was added; root used npm ci with the checked-in lockfile and scripts disabled.

The change is prepared for a separate draft PR. It does not merge/deploy PR27 or this patch and does not establish production acceptance, automatic recovery of an executing action_requests row, permanent deduplication after business-row deletion, or recovery of old random-ID insertions. Earlier builder statements above describe that stage; the root reviewer owns subsequent Git publication and records its commit/PR in the overnight checkpoint. Claude review remains unavailable because of previously verified native permission and CLI-auth blockers.
