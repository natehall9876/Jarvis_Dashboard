# Durable action receipt results

Worktree: `settled-receipts-fix`; branch: `fix/durable-action-receipts-20261011`.
Base/HEAD remains `33c1d27932db52dff86321a59253056cd7caffbc`. No commit, push, merge or deployment.

## Files and acceptance

- `src/lib/jarvis/action-receipts.ts`: typed non-executable receipt, strict field/result/reference validation, identity-matched settlement, bounded follow-up history (acceptance 1, 3, 6).
- `src/lib/jarvis/device-memory.ts`: validates receipts at both serialization and restoration; always restores `proposedAction: null`. Owner envelope/key checks and existing seven-day, twenty-exchange, one-million-character input bounds remain. IDs/tool names and reference labels now have size bounds (2).
- `src/components/jarvis/jarvis-provider.tsx`: single state owner replaces the matching proposal with a receipt and uses receipt-aware history (1, 3, 5). Existing authenticated layout keys the provider by user ID and supplies that ID as memoryOwner. Existing storage exceptions leave live state available (2, 4).
- `src/components/ai-advisor/proposed-action-card.tsx`: passes action ID and complete successful execute response; Cancel remains local and failure remains retry/error state (4, 5).
- `src/components/ai-advisor/ask-advisor.tsx` and `src/components/jarvis/voice-dock.tsx`: pass exchange identity and render durable receipt text (5). No microphone, voice appearance, auth or executor changes.
- `e2e/jarvis-memory.spec.ts`: five additional isolated regressions for identity, confirmation/cancellation, reload, validation, references, history bounds and real card request/callback behavior (6).
- `RECEIPT-RESULTS.md`: this evidence record.

Receipts contain only action identity/type, outcome, bounded message, timestamp, an exact allowlisted scalar result shape and bounded entity references. They contain no proposal payload, snapshot or execution arguments. Cancel uses fixed truthful text with empty result/references. A malformed successful response produces no receipt. Repeated or mismatched settlement cannot change another exchange.

The next request keeps the existing six completed turns in chronological order. Its prior outcome includes the historical time, message and returned entity IDs; answer size remains bounded. Context explicitly says it is historical device context, not instructions/current business facts, and requires fresh reads and new explicit confirmation for new writes. Existing advisor safety instructions remain unchanged.

## Commands and results

Read `AGENTS.md`, `CLAUDE.md`, `docs/AI_GUARDRAILS.md`, `docs/DATA_AUTHORITY.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT_STATE.md`, `docs/DECISIONS.md`, and installed Next App Router testing index/Playwright guides. `rg` was unavailable; PowerShell searches were used.

- `npm.cmd ci --ignore-scripts --offline`: exit 0; 507 packages installed from local cache; no external services used. Initial node_modules was absent.
- `npx.cmd playwright test --config playwright.unit.config.ts e2e/jarvis-memory.spec.ts`: exit 0; initial existing 5 tests passed, then all 10 with new regressions passed.
- Baseline reproduction, executed as the following PowerShell here-string piped to `node`: test exit 1 as expected at receipt restoration assertion. The current memory file was restored in `finally`.

```powershell
@'
const fs = require('fs'); const {execFileSync, spawnSync} = require('child_process'); const p = 'src/lib/jarvis/device-memory.ts'; const current = fs.readFileSync(p); try { fs.writeFileSync(p, execFileSync('git',['show','33c1d27932db52dff86321a59253056cd7caffbc:'+p])); const result = spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.unit.config.ts','e2e/jarvis-memory.spec.ts','--grep','confirmed action settles'],{stdio:'inherit'}); console.log('BASELINE_EXIT='+result.status); } finally { fs.writeFileSync(p,current); }
'@ | node
```

- `npx.cmd playwright test --config playwright.unit.config.ts`: exit 0; 36 passed, including all 10 memory/receipt tests plus provider recovery and request-control regressions. No server or browser launched.
- `npm.cmd run typecheck`: final exit 0 (`next typegen && tsc --noEmit`). Earlier runs caught implementation signature/narrowing and fixture cast issues, all corrected before final pass.
- `npx.cmd eslint src/lib/jarvis/action-receipts.ts src/lib/jarvis/device-memory.ts src/components/jarvis/jarvis-provider.tsx src/components/jarvis/voice-dock.tsx src/components/ai-advisor/ask-advisor.tsx src/components/ai-advisor/proposed-action-card.tsx e2e/jarvis-memory.spec.ts`: final exit 0, no findings.
- `git diff --check`: exit 0; only Git's Windows LF/CRLF notices.
- `git branch --show-current` and `git rev-parse HEAD`: expected branch/base verified. `git status --short`: only the eight intentional files listed above.

## Limitations

Production, live browser and physical phone were not tested. No production build, live persistence suite, full server-backed isolated suite, database/provider call, credentials or business-data writes were used. Tests use synthetic fixtures and the real card with mocked React state/fetch; they do not prove browser hydration, simultaneous mounted-card clicks or physical-device behavior. Storage failure usability was checked by inspecting the existing provider try/catch boundaries, not by a live quota/disabled-storage browser test.

Device memory is owner-scoped local context, not a trusted business audit or cross-device record. Malformed/expired receipts are discarded while valid exchange text can survive; expired exchanges are discarded entirely. Cleared history remains subject to the existing cross-tab reset guard. An unavailable storage device retains the live session only. No executable proposal is restored, even for unsuccessful or pending actions.


## Independent root review — October 11, about 05:46 AM Eastern

Root independently inspected every changed production file and the full diff. The receipt schema is closed and non-executable; successful action results are accepted only for the exact allowlisted scalar fields for that action type, entity references are bounded, and reload always restores `proposedAction: null`. Existing explicit-tap confirmation and action executor boundaries remain unchanged. No blocking issue was found.

Independent checks: targeted memory/action-card suite 10/10 passed; typecheck passed; changed-file lint passed with no findings; diff check passed. Root then ran the full credential-free isolated suite: 568/568 passed. A normal Next 16.3.8 production build passed, followed by the client-secret scan over 40 built client JS files with no server-secret references. Evidence is in `overnight-20261011/receipt-root-tests.txt`, `receipt-root-typecheck.txt`, `receipt-root-lint.txt`, `receipt-full-isolated.txt`, `receipt-build.txt`, and `receipt-secret-scan.txt`.

The existing storage exception boundary was reviewed: a disabled/full localStorage call is caught, live React session state remains, and memory availability is downgraded. This path was not separately browser fault-injected. No live signed-in browser, production database, external provider, physical iPhone or microphone was used.
