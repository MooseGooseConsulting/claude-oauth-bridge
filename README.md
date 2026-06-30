# claude-oauth-bridge

`claude-oauth-bridge` is a local HTTP bridge that lets agent frameworks call a Claude Code OAuth-bearing runtime through model-provider-shaped endpoints.

It intentionally does not use the regular Anthropic SDK or `ANTHROPIC_API_KEY` provider path.

## Backend

Current backend: `claude-cli`.

The bridge runs `claude -p` with `--output-format stream-json` and normalizes the result into Anthropic-ish or OpenAI-ish HTTP responses. The subprocess environment preserves normal environment variables but explicitly removes:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_AUTH_TOKEN`

`CLAUDE_CODE_OAUTH_TOKEN`, when present, is visible only to this bridge process and the Claude CLI subprocess it owns.

The bridge also supports the normal local Claude Code login state. If `CLAUDE_CODE_OAUTH_TOKEN` is not set, startup checks for Claude Code's local credentials file at `.claude/.credentials.json` under the process home directory and allows the Claude CLI runtime to authenticate itself. The bridge only checks that the file exists and has content; it does not read or log credential values.

Bridge model-provider endpoints run Claude Code with `--safe-mode` and `--tools ""`. This keeps Claude Code OAuth/keychain authentication available while disabling project customizations, hooks, MCP servers, memory injection, and model-side tool execution for `/v1/messages` and `/v1/chat/completions`. Job-native endpoints also use `--safe-mode` but keep built-in tools available for workspace work.

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
$env:PORT = "8787"
$env:HOST = "127.0.0.1"
npm run dev
```

First run `claude auth login` or otherwise make sure `claude -p "Reply exactly: ok"` works in the same user account. `CLAUDE_CODE_OAUTH_TOKEN` is optional; if you use it, keep it only in the bridge process environment.

Do not set `ANTHROPIC_API_KEY` for this bridge path. If it exists in the parent environment, the bridge removes it before spawning Claude.

`HOST` defaults to `127.0.0.1`. Binding to a non-loopback address requires `BRIDGE_API_KEY`; callers then need `Authorization: Bearer <BRIDGE_API_KEY>` or `X-Bridge-Api-Key`.

If `BRIDGE_API_KEY` is unset, the bridge generates an ephemeral key at startup. Set `BRIDGE_AUTH_DISABLED=1` only for explicitly trusted loopback-only test runs.

Workspace job endpoints are restricted to `CLAUDE_OAUTH_ALLOWED_WORKSPACES`, a semicolon- or comma-separated list. If unset, only the bridge process working directory is allowed.

Resource limits:

- `REQUEST_TIMEOUT_MS`, default `30000`
- `CONCURRENCY`, default `2`
- `MAX_QUEUE_SIZE`, default `16`
- `MAX_REQUEST_BYTES`, default `1048576`
- `MAX_OUTPUT_BYTES`, default `10485760`

Docker deployments must set `HOST=0.0.0.0` if the bridge should be reachable outside the container. Non-loopback binding requires `BRIDGE_API_KEY`.

## Tool Calls

`/v1/messages` currently supports text-only calls. If a request includes `tools`, the bridge returns `tool_use_not_supported` instead of pretending tool calls work.

`max_tokens` and `temperature` are accepted for framework compatibility but are currently no-ops for the `claude-cli` backend.

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
$env:CLAUDE_OAUTH_LIVE_READY = "1"
npm test -- tests/live.test.ts
```

## Chained PR Plan

1. Core bridge service.
2. Mastra custom provider adapter.
3. Hermes provider adapter.
4. Letta provider adapter.
5. Webhook-triggered repo automation runner.

## Mastra Adapter

The Mastra adapter lives at `src/adapters/mastra/claudeOauthGateway.ts`. The import paths below are repo-local examples for this bridge project.

```ts
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { ClaudeOauthMastraGateway } from "./src/adapters/mastra/claudeOauthGateway.js";

export const mastra = new Mastra({
  gateways: {
    "claude-oauth": new ClaudeOauthMastraGateway({
      bridgeUrl: process.env.CLAUDE_OAUTH_BRIDGE_URL,
      bridgeApiKey: process.env.CLAUDE_OAUTH_BRIDGE_API_KEY
    })
  }
});

export const agent = new Agent({
  id: "bridge-agent",
  name: "Bridge Agent",
  instructions: "You answer through the local Claude OAuth bridge.",
  model: "claude-oauth/claude-oauth/sonnet"
});
```

Mastra router model strings are `gateway/provider/model`, so the gateway form is:

- `claude-oauth/claude-oauth/sonnet`
- `claude-oauth/claude-oauth/sonnet-high`

For simpler integrations, create the model directly:

```ts
import { createClaudeOauthMastraModel } from "./src/adapters/mastra/claudeOauthGateway.js";

const model = createClaudeOauthMastraModel("claude-oauth/sonnet", {
  bridgeUrl: process.env.CLAUDE_OAUTH_BRIDGE_URL,
  bridgeApiKey: process.env.CLAUDE_OAUTH_BRIDGE_API_KEY
});
```

The direct factory accepts the bridge model ids:

- `claude-oauth/sonnet`
- `claude-oauth/sonnet-high`

Mastra must not receive `CLAUDE_CODE_OAUTH_TOKEN`. The bridge owns Claude OAuth. The Mastra adapter only receives:

- `CLAUDE_OAUTH_BRIDGE_URL`
- `CLAUDE_OAUTH_BRIDGE_API_KEY`, if bridge auth is enabled

`BRIDGE_API_KEY` configures the bridge server. `CLAUDE_OAUTH_BRIDGE_API_KEY` is the Mastra-side client variable; set it to the same value when bridge auth is enabled. If the bridge is running with `BRIDGE_AUTH_DISABLED=1`, the adapter can be constructed without `CLAUDE_OAUTH_BRIDGE_API_KEY`.

Current limitations:

- Tool calls are rejected with `tool_use_not_supported`.
- Streaming is rejected with `streaming_not_supported`.
- Structured output should be handled by Mastra-side parsing or a later bridge capability PR.

## Hermes Adapter

Hermes can use the bridge through its custom-provider OpenAI-compatible endpoint support. The helper lives at `src/adapters/hermes/claudeOauthBridge.ts`.

Example Hermes custom provider:

```yaml
custom_providers:
  - name: "claude-oauth-bridge"
    base_url: "http://localhost:8080/v1"
    key_env: "CLAUDE_OAUTH_BRIDGE_API_KEY"
    api_mode: "openai"
    model: "claude-oauth/sonnet"
    models:
      claude-oauth/sonnet:
        context_length: 200000
      claude-oauth/sonnet-high:
        context_length: 200000
```

Equivalent TypeScript helper:

```ts
import { buildHermesCustomProvider } from "./src/adapters/hermes/claudeOauthBridge.js";

const provider = buildHermesCustomProvider({
  bridgeUrl: process.env.CLAUDE_OAUTH_BRIDGE_URL,
  apiKeyEnv: "CLAUDE_OAUTH_BRIDGE_API_KEY"
});
```

Hermes provider id:

- `claude-oauth-bridge`

Hermes model ids:

- `claude-oauth/sonnet`
- `claude-oauth/sonnet-high`

Hermes must not receive `CLAUDE_CODE_OAUTH_TOKEN`. The bridge owns Claude OAuth. Hermes only needs:

- `CLAUDE_OAUTH_BRIDGE_URL`, for example `http://localhost:8080`
- `CLAUDE_OAUTH_BRIDGE_API_KEY`, if bridge auth is enabled

Current limitations:

- Hermes tool calls are disabled for this provider path until the bridge implements tool-call translation.
- Streaming is disabled for the helper path until the bridge implements streaming translation.
- Hermes memory and tools remain Hermes-owned; the bridge is model-only for this adapter path.
