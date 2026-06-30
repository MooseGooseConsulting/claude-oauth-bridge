import {
  buildLettaOpenAICompatibleConfig,
  buildLettaTurnState,
  normalizeLettaBridgeUrl,
  parseLettaBridgeResponse,
  rejectUnsupportedLettaTools,
  toLettaBridgeChatRequest,
  toLettaModelHandle
} from "../src/adapters/letta/claudeOauthBridge.js";

describe("Letta claude-oauth-bridge adapter helpers", () => {
  it("builds OpenAI-compatible Letta model endpoint config", () => {
    const config = buildLettaOpenAICompatibleConfig({
      apiKeyEnv: "CLAUDE_OAUTH_BRIDGE_API_KEY"
    });

    expect(config).toEqual({
      provider: "claude-oauth-bridge",
      model: "claude-oauth/sonnet",
      baseUrl: "http://localhost:8787/v1",
      apiKeyEnv: "CLAUDE_OAUTH_BRIDGE_API_KEY",
      endpointType: "openai-compatible",
      toolCalls: false
    });
  });

  it("normalizes bridge URLs to the /v1 endpoint base", () => {
    expect(normalizeLettaBridgeUrl("http://bridge:8080")).toBe("http://bridge:8080/v1");
    expect(normalizeLettaBridgeUrl("http://bridge:8080/v1")).toBe("http://bridge:8080/v1");
    expect(normalizeLettaBridgeUrl("")).toBe("http://localhost:8787/v1");
  });

  it("parses and validates Letta model handles", () => {
    expect(toLettaModelHandle("sonnet")).toBe("claude-oauth/sonnet");
    expect(toLettaModelHandle("claude-oauth/sonnet-high")).toBe("claude-oauth/sonnet-high");
    expect(() => toLettaModelHandle("anthropic/claude-sonnet-4")).toThrow(
      /Unsupported Letta bridge model/
    );
  });

  it("does not include caller-owned secrets in Letta config", () => {
    const config = buildLettaOpenAICompatibleConfig({ bridgeUrl: "http://localhost:8787" });

    expect(JSON.stringify(config)).not.toContain("secret");
  });

  it("formats OpenAI-compatible chat requests for the bridge", () => {
    const request = toLettaBridgeChatRequest({
      model: "claude-oauth/sonnet",
      messages: [
        { role: "system", content: "Remember the user's project." },
        { role: "user", content: "Reply exactly: letta-oauth-ok" }
      ],
      memory: { facts: ["memory stays in Letta"] }
    });

    expect(request).toEqual({
      model: "claude-oauth/sonnet",
      messages: [
        { role: "system", content: "Remember the user's project." },
        { role: "user", content: "Reply exactly: letta-oauth-ok" }
      ],
      stream: false
    });
  });

  it("keeps Letta-owned memory state outside bridge requests", () => {
    const first = buildLettaTurnState(undefined, { project: "bridge" });
    const second = buildLettaTurnState(first.memory, { task: "adapter" });

    expect(second.memory).toEqual({ project: "bridge", task: "adapter" });
    expect(
      JSON.stringify(
        toLettaBridgeChatRequest({
          model: "sonnet",
          messages: [{ role: "user", content: "What do you remember?" }],
          memory: second.memory
        })
      )
    ).not.toContain("adapter");
  });

  it("parses OpenAI-compatible bridge responses", () => {
    expect(
      parseLettaBridgeResponse({
        choices: [{ message: { role: "assistant", content: "letta-oauth-ok" } }]
      })
    ).toEqual({ text: "letta-oauth-ok" });
  });

  it("fails loudly for native tool calls because the bridge is text-only", () => {
    expect(() => rejectUnsupportedLettaTools([{ name: "memory_search" }])).toThrow(
      /Tool calls are not supported/
    );
  });
});
