# Claude OAuth Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first chained PR: a working local `claude-oauth-bridge` service backed by Claude Code OAuth, with tests and docs.

**Architecture:** Use a small TypeScript Node HTTP server. Keep provider request normalization, response normalization, backend execution, job prompts, logging, and concurrency as separate modules.

**Tech Stack:** TypeScript, Node.js built-in HTTP server, Vitest, ESLint, Claude Code CLI backend.

---

## File Structure

- `package.json`: scripts and dependencies.
- `tsconfig.json`: strict TypeScript config.
- `eslint.config.js`: lint config.
- `vitest.config.ts`: test config.
- `src/models.ts`: model IDs and alias mapping.
- `src/errors.ts`: typed HTTP errors.
- `src/redaction.ts`: secret redaction helpers.
- `src/config.ts`: env/config loading and OAuth detection.
- `src/normalizers.ts`: Anthropic-ish and OpenAI-ish request/response conversions.
- `src/backend/types.ts`: backend interface.
- `src/backend/claudeCli.ts`: supervised Claude CLI backend.
- `src/concurrency.ts`: request limiter.
- `src/jobs.ts`: review/fix prompt builders and structured parsing.
- `src/server.ts`: HTTP routing.
- `src/index.ts`: process entrypoint.
- `tests/*.test.ts`: TDD tests for the contract.
- `README.md`, `.env.example`, `Dockerfile`: deliverables.

## Tasks

### Task 1: Project Scaffold And Contract Tests

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `vitest.config.ts`
- Create: `tests/normalizers.test.ts`
- Create: `tests/config.test.ts`
- Create: `tests/server.test.ts`
- Create: `tests/jobs.test.ts`

- [ ] Write tests that import the intended public functions before creating `src`.
- [ ] Run `npm test` and verify the tests fail because production modules do not exist.
- [ ] Commit the red tests and scaffold.

### Task 2: Normalization, Config, And Errors

**Files:**
- Create: `src/models.ts`
- Create: `src/errors.ts`
- Create: `src/redaction.ts`
- Create: `src/config.ts`
- Create: `src/normalizers.ts`

- [ ] Implement only the code needed for request normalization, response normalization, model validation, unsupported tools errors, OAuth detection, and redaction.
- [ ] Run `npm test -- tests/normalizers.test.ts tests/config.test.ts`.
- [ ] Commit the passing normalization/config slice.

### Task 3: Mockable Server And Job Endpoints

**Files:**
- Create: `src/backend/types.ts`
- Create: `src/concurrency.ts`
- Create: `src/jobs.ts`
- Create: `src/server.ts`

- [ ] Implement a dependency-injected HTTP server that accepts a backend implementation.
- [ ] Implement `/health`, `/v1/models`, `/v1/messages`, `/v1/chat/completions`, `/jobs/review`, and `/jobs/fix`.
- [ ] Run `npm test -- tests/server.test.ts tests/jobs.test.ts`.
- [ ] Commit the passing server/job slice.

### Task 4: Claude CLI Backend

**Files:**
- Create: `src/backend/claudeCli.ts`
- Create: `src/index.ts`
- Create: `tests/claudeCli.test.ts`
- Create: `tests/live.test.ts`

- [ ] Write failing tests for env isolation and stream-json parsing.
- [ ] Implement `ClaudeCliBackend` with timeout, max turns where supported, cwd support, and API-key env removal.
- [ ] Keep live test skipped unless `RUN_LIVE_CLAUDE=1` and OAuth is configured.
- [ ] Run `npm test -- tests/claudeCli.test.ts tests/live.test.ts`.
- [ ] Commit the backend slice.

### Task 5: Documentation And Container

**Files:**
- Create: `README.md`
- Create: `.env.example`
- Create: `Dockerfile`

- [ ] Document that the backend is `claude-cli`.
- [ ] Document that `ANTHROPIC_API_KEY` is not used.
- [ ] Document tool-call limitation and live-test opt-in.
- [ ] Run `npm run lint`, `npm run typecheck`, and `npm test`.
- [ ] Commit documentation and container files.

### Task 6: Subagent Review And PR

**Files:**
- Modify as review findings require.

- [ ] Dispatch a spec-compliance reviewer subagent against the branch diff.
- [ ] Dispatch a red-team/code-quality reviewer subagent against the branch diff.
- [ ] Fix Critical and Important findings with tests first.
- [ ] Re-run `npm run lint`, `npm run typecheck`, and `npm test`.
- [ ] Push the branch and open PR 1.

## Later Chained PRs

- PR 2: Mastra provider adapter.
- PR 3: Hermes provider adapter.
- PR 4: Letta provider adapter.
- PR 5: webhook-triggered repo automation runner.

## Self-Review

- The plan covers all Prompt 1 bridge deliverables.
- Adapter and runner work is deliberately excluded from PR 1 and listed as chained follow-up PRs.
- The backend selection is explicit: `claude-cli`.
- No step requires the normal Anthropic SDK or `ANTHROPIC_API_KEY`.
