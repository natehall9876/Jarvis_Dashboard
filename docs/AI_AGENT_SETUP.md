# Owner-triggered Claude coding tasks

The `Claude owner task` workflow accepts one manually entered code task, checks
the result, and opens a draft pull request. It does not deploy or merge changes.
It is limited to `natehall9876` on `main`, including who reruns a job. Public
comments, issues, fork PRs and scheduled events do not trigger this workflow.

## Activation

1. Merge the workflow setup PR so `.github/workflows/claude-task.yml` is on `main`.
2. On the owner's trusted computer, run `claude setup-token` using a Claude
   subscription. Store the result as the repository Actions secret
   `CLAUDE_CODE_OAUTH_TOKEN`; never paste it into chat, source files or logs.
   An existing properly configured secret can be reused. The workflow checks
   only whether the secret is present and never prints it.
3. In GitHub repository **Settings → Actions → General → Workflow permissions**,
   enable **Allow GitHub Actions to create and approve pull requests**. This
   workflow creates drafts only and never approves or merges a PR.
4. Open **Actions → Claude owner task → Run workflow**, select `main`, and enter
   a small code task with observable acceptance checks. Inputs and workflow logs
   are public in this repository, so do not include customer names, addresses,
   messages, invoices or other private business information.

This setup uses GitHub's short-lived `GITHUB_TOKEN` with explicit contents and
pull-request write permissions. It does not require installing the Claude
GitHub App or adding a personal GitHub token. It accepts subscription OAuth only;
there is no API-key fallback or newly configured API billing path.

## Limits and verification

- One run at a time; 20-minute job timeout; 25 Claude turns.
- `--max-budget-usd 2.00` is an estimated model-usage stop condition, not a
  guaranteed dollar billing ceiling. Subscription limits still apply; the CLI
  estimate can overshoot. No recurring run is configured.
- Only changes under `src/`, `docs/`, `e2e/`, `e2e-live/`, and `scripts/` can be
  published. Workflow, credential, dependency and lockfile changes need a
  separate reviewed change. A missing credential fails before model invocation.
- The agent cannot commit/push through its permitted tools. A separate workflow
  step stages the allowed changes, checks them, and publishes a new run-specific
  branch. It never pushes to `main`.
- Validation runs typecheck, lint, build, the client-secret check, isolated
  integration tests, ownership DB tests, activity tests, intelligence tests and
  native insert tests. A failure stops publication; it is not treated as a pass.
- GitHub suppresses further workflow triggers for changes made with
  `GITHUB_TOKEN`. The draft PR links to the validation in the originating run;
  it does not imply another CI workflow ran. To test later human edits, rely on
  the normal PR CI workflow.
- Source tests do not prove production integrations, customer-data accuracy,
  mobile-device behavior or Roblox gameplay. Those require separate acceptance
  checks in their own environments.

Start with a small documentation or pure-code task. Confirm the run succeeds,
inspect its checks, and verify it creates a draft on a new branch. Authentication
and this end-to-end run must be observed before calling the integration active.

## Sources and pinning

The action is pinned to `f3b070c88125d33dbae5653df5f143101d4ea9dc`
(`v1.0.276`, verified November 13, 2026). Checkout and setup-node are also pinned.
Review upstream changes before changing these pins.

- [Official Claude Code Action](https://github.com/anthropics/claude-code-action)
- [Authentication setup](https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md)
- [Action security and permissions](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)
- [GitHub Actions integration](https://code.claude.com/docs/en/github-actions)
- [CLI limits](https://code.claude.com/docs/en/cli-reference)
