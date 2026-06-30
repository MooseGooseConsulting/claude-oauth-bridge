import {
  buildHermesCustomProvider,
  normalizeHermesBridgeUrl,
  parseHermesBridgeResponse,
  rejectUnsupportedHermesTools,
  toHermesBridgeChatRequest,
  toHermesModelId
} from "../src/adapters/hermes/claudeOauthBridge.js";

describe("Hermes claude-oauth-bridge adapter helpers", () => {
  it("builds a Hermes custom provider entry for the bridge", () => {
    const provider = buildHermesCustomProvider({
      bridgeUrl: "http://localhost:8080/",
      apiKeyEnv: "CLAUDE_OAUTH_BRIDGE_API_KEY"
    });

    expect(provider).toEqual({
      name: "claude-oauth-bridge",
      base_url: "http://localhost:8080/v1",
      key_env: "CLAUDE_OAUTH_BRIDGE_API_KEY",
      api_mode: "openai",
      model: "claude-oauth/sonnet",
      models: {
        "claude-oauth/sonnet": { context_length: 200000 },
        "claude-oauth/sonnet-high": { context_length: 200000 }
      }
    });
  });

  it("normalizes bridge URLs to the OpenAI-compatible /v1 base URL", () => {
    expect(normalizeHermesBridgeUrl("http://bridge:8080")).toBe("http://bridge:8080/v1");
    expect(normalizeHermesBridgeUrl("http://bridge:8080/v1")).toBe("http://bridge:8080/v1");
  });

  it("maps and validates Hermes model ids", () => {
    expect(toHermesModelId("sonnet")).toBe("claude-oauth/sonnet");
    expect(toHermesModelId("claude-oauth/sonnet-high")).toBe("claude-oauth/sonnet-high");
    expect(() => toHermesModelId("claude-3-5-sonnet")).toThrow(/Unsupported Hermes bridge model/);
  });

  it("does not read Claude Code OAuth token from the Hermes process", () => {
    const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "must-not-be-read";

    try {
      const provider = buildHermesCustomProvider({ bridgeUrl: "http://localhost:8080" });

      expect(JSON.stringify(provider)).not.toContain("must-not-be-read");
    } finally {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
    }
  });

  it("converts Hermes-style messages to an OpenAI-compatible bridge request", () => {
    const request = toHermesBridgeChatRequest({
      model: "sonnet-high",
      messages: [
        { role: "system", content: "Be exact." },
        { role: "user", content: "Reply exactly: hermes-oauth-ok" }
      ]
    });

    expect(request).toEqual({
      model: "claude-oauth/sonnet-high",
      messages: [
        { role: "system", content: "Be exact." },
        { role: "user", content: "Reply exactly: hermes-oauth-ok" }
      ],
      stream: false
    });
  });

  it("parses OpenAI-compatible bridge responses back to text", () => {
    expect(
      parseHermesBridgeResponse({
        choices: [{ message: { role: "assistant", content: "hermes-oauth-ok" } }]
      })
    ).toEqual({ text: "hermes-oauth-ok" });
  });

  it("fails loudly for tool calls because the bridge is text-only", () => {
    expect(() => rejectUnsupportedHermesTools([{ name: "readFile" }])).toThrow(
      /Tool calls are not supported/
    );
  });
});
