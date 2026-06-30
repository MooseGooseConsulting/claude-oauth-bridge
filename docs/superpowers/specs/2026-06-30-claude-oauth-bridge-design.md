# Claude OAuth Bridge Design

## Goal

Build `claude-oauth-bridge` as the first project in the chained PR series. It exposes local HTTP model-provider endpoints backed by Claude Code OAuth authentication, without using the normal Anthropic API-key SDK path.

## Scope For PR 1

PR 1 builds the bridge only:

- `GET /health`
- `GET /v1/models`
- `POST /v1/messages`
- `POST /v1/chat/completions`
- `POST /jobs/review`
- `POST /jobs/fix`
- Dockerfile, README, `.env.example`, tests

Mastra, Hermes, Letta, and the repo automation runner are intentionally later chained PRs. They depend on this bridge contract.

## Architecture

The service is a TypeScript Node HTTP server using built-in `node:http`. It keeps the framework-facing API small and testable, and it avoids unnecessary framework coupling in the bridge.

The initial backend is `claude-cli`. The bridge runs a supervised `claude -p` subprocess with `--output-format stream-json`, `--model`, `--effort`, `--permission-mode`, and `--no-session-persistence`. The subprocess environment preserves the parent process except it explicitly removes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`.

Agent SDK support is not included in PR 1. It can be added in a later chained PR after inspecting the installed SDK API and proving it can use the desired OAuth-bearing runtime in this environment.

## Security Boundaries

- Callers cannot pass environment variables.
- Callers cannot trigger arbitrary shell commands.
- Workspace job endpoints only pass a validated workspace path as Claude CLI cwd.
- `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_AUTH_TOKEN` are redacted from structured logs.
- Tool calls on `/v1/messages` return an explicit unsupported error until tool event translation is implemented.

## API Contract

`GET /health` returns:

```json
{
  "ok": true,
  "backend": "claude-cli",
  "oauthConfigured": true
}
```

`GET /v1/models` returns:

```json
{
  "object": "list",
  "data": [
    { "id": "claude-oauth/sonnet", "object": "model" },
    { "id": "claude-oauth/sonnet-high", "object": "model" }
  ]
}
```

`POST /v1/messages` accepts a text-only Anthropic-ish Messages subset and returns a normalized assistant message.

`POST /v1/chat/completions` accepts a minimal OpenAI-compatible chat request and returns a text completion response for frameworks that can only target OpenAI-shaped endpoints.

`POST /jobs/review` and `POST /jobs/fix` run job-native prompts against an existing workspace and return structured JSON parsed from Claude output when possible, with raw text retained as a fallback.

## Testing

Tests cover request normalization, response normalization, missing OAuth configuration, API-key isolation, mock backend routes, job route behavior, and optional live CLI behavior when `CLAUDE_CODE_OAUTH_TOKEN` is present.

The live test is skipped by default unless `RUN_LIVE_CLAUDE=1` and OAuth is configured.
