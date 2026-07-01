---
slug: quick-review-commit-pr
status: awaiting-approval
intent: clear
review_required: false
pending-action: write .omo/plans/quick-review-commit-pr.md after explicit approval; execution remains for /start-work worker
approach: Quick read-only review, run existing npm verification, commit only if new intended dirty files exist, push pr5-repo-automation-runner, and open/update a PR for Coldaine/claude-oauth-bridge.
---

# Draft: quick-review-commit-pr

## Components
| id | outcome | status | evidence path |
|---|---|---|---|
| 1. Quick review/verification | Run the repo's cheap checks before shipping | active | `package.json` scripts: `lint`, `typecheck`, `test`; README Development section |
| 2. Commit/push | Commit only intended dirty changes, then push branch | active | read-only git check: branch `pr5-repo-automation-runner`, upstream `origin/pr5-repo-automation-runner`, dirty files none |
| 3. PR creation | Open or update PR via GitHub CLI | active | read-only git check: `gh repo view` resolves `Coldaine/claude-oauth-bridge` |

## Findings
- Repository: `claude-oauth-bridge`, TypeScript/Node >=22 project.
- Available verification scripts: `npm run lint`, `npm run typecheck`, `npm test`.
- Current branch: `pr5-repo-automation-runner`.
- Upstream: `origin/pr5-repo-automation-runner`.
- Current worktree: clean at planning time; no staged or unstaged diff to commit.
- Commit style: lowercase conventional prefixes such as `chore:`, `fix:`, `feat:`.
- PR target repo visible via GitHub CLI: `Coldaine/claude-oauth-bridge`.

## Scope IN
- Brief agent-executed review: inspect status/diff and run lint/typecheck/tests.
- If the worker finds intended dirty changes at execution time, stage them atomically and commit with existing message style.
- Push the current branch to its upstream.
- Open a PR if none exists for the branch, or report/update the existing PR if one exists.

## Scope OUT / Must NOT Have
- Do not commit secrets, `.env`, OAuth tokens, or provider-token paths.
- Do not force-push or rewrite history.
- Do not manufacture an empty commit just to satisfy “commit everything” if the worktree remains clean.
- Do not include unrelated dirty files if any appear during execution.
- Do not merge the PR.

## Open questions
- None blocking. Adopted default: if there are no dirty files at execution time, skip commit and continue with push/PR creation or report that there was nothing to commit.

## Approval gate
status: awaiting-approval
Pending action: write `.omo/plans/quick-review-commit-pr.md` for a worker to execute. Approval authorizes plan writing only; execution starts only via explicit `/start-work` or equivalent.
