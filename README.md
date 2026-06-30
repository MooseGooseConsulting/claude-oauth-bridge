# claude-oauth-bridge

`claude-oauth-bridge` is a local HTTP bridge that lets agent frameworks call a Claude Code OAuth-bearing runtime through model-provider-shaped endpoints.

It intentionally does not use the regular Anthropic SDK or `ANTHROPIC_API_KEY` provider path.

## Backend

Current backend: `claude-cli`.

The bridge runs `claude -p` with `--output-format stream-json` and normalizes the result into Anthropic-ish or OpenAI-ish HTTP responses. The subprocess environment preserves normal environment variables but explicitly removes:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`

`CLAUDE_CODE_OAUTH_TOKEN`, when present, is visible only to this bridge process and the Claude CLI subprocess it owns.

## Endpoints

- `GET /health`
- `GET /v1/models`
- `POST /v1/messages`
- `POST /v1/chat/completions`
- `POST /jobs/review`
- `POST /jobs/fix`

Models:

- `claude-oauth/sonnet`
- `claude-oauth/sonnet-high`

## Configuration

Copy `.env.example` and set values in your process manager or shell.

```powershell
$env:CLAUDE_CODE_OAUTH_TOKEN = "..."
$env:PORT = "8787"
$env:HOST = "127.0.0.1"
npm run dev
```

Do not set `ANTHROPIC_API_KEY` for this bridge path. If it exists in the parent environment, the bridge removes it before spawning Claude.

`HOST` defaults to `127.0.0.1`. Binding to a non-loopback address requires `BRIDGE_API_KEY`; callers then need `Authorization: Bearer <BRIDGE_API_KEY>` or `X-Bridge-Api-Key`.

If `BRIDGE_API_KEY` is unset, the bridge generates an ephemeral key at startup. Set `BRIDGE_AUTH_DISABLED=1` only for explicitly trusted loopback-only test runs.

Workspace job endpoints are restricted to `CLAUDE_OAUTH_ALLOWED_WORKSPACES`, a semicolon- or comma-separated list. If unset, only the bridge process working directory is allowed.

## Tool Calls

`/v1/messages` currently supports text-only calls. If a request includes `tools`, the bridge returns `tool_use_not_supported` instead of pretending tool calls work.

Tool-call translation should be added only after the Claude runtime event stream exposes clean tool-use semantics for this bridge contract.

## Jobs

`/jobs/review` and `/jobs/fix` run Claude with `cwd` set to a validated existing workspace directory. Callers cannot pass arbitrary environment variables or shell commands.

The Docker image installs the pinned Claude Code CLI package used by the `claude-cli` backend. You still need to provide OAuth configuration at runtime.

## Development

```powershell
npm install
npm run lint
npm run typecheck
npm test
```

Live Claude CLI verification is opt-in:

```powershell
$env:RUN_LIVE_CLAUDE = "1"
$env:CLAUDE_CODE_OAUTH_TOKEN = "..."
npm test -- tests/live.test.ts
```

## Chained PR Plan

1. Core bridge service.
2. Mastra custom provider adapter.
3. Hermes provider adapter.
4. Letta provider adapter.
5. Webhook-triggered repo automation runner.
