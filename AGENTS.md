## Project Instructions

This repository implements `claude-oauth-bridge`, a private/internal HTTP bridge
for Claude subscription OAuth-backed model calls.

Hard boundaries:

- Do not use `ANTHROPIC_API_KEY` as a provider path.
- Do not use `ANTHROPIC_AUTH_TOKEN` as a provider path.
- Do not use the regular Anthropic SDK as the OAuth translation layer.
- The bridge is the only process that may receive `CLAUDE_CODE_OAUTH_TOKEN`.
- Adapters and framework callers must talk to the bridge over HTTP.
- Redact secrets from all logs and errors.

Development workflow:

- Use TDD for production code changes.
- Preserve durable progress with commits.
- Keep PRs focused and chained: bridge first, then adapters, then runner.
