@AGENTS.md

# Project documentation

Before making an architectural decision (new table, new Jarvis capability,
new integration, changing the write-action safety model), read the relevant
file in `docs/` first — they document what's actually built and why, not
aspirational design:

- `docs/ARCHITECTURE.md` — the real layer map, data model, and the Jarvis
  read/write architecture.
- `docs/AI_GUARDRAILS.md` — rules that must hold for every change to
  `src/lib/ai/*`. Read this before touching the advisor loop, the tool
  registry, or the write-action executor.
- `docs/DATA_AUTHORITY.md` — which system is allowed to be the source of
  truth for what, today and as integrations get built.
- `docs/DECISIONS.md` — why specific choices were made, so they aren't
  accidentally undone.
- `docs/CURRENT_STATE.md` — what's live vs. built-but-not-yet-migrated vs.
  not started. Check this before assuming a table or feature is live.
- `docs/TESTING.md` — what test coverage exists, what doesn't, and why.
- `docs/TRIAL_RUNBOOK.md` — the exact steps to install, run, and manually
  test the app end to end.

If this file says something exists but the repository shows otherwise,
trust the repository — these docs describe intent and are updated
alongside code, but the code is the ground truth.
