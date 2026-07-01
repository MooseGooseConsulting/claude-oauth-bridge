import {
  CLAUDE_OAUTH_MASTRA_MODELS,
  ClaudeOauthMastraGateway,
  createClaudeOauthMastraModel,
  rejectUnsupportedBridgeRequest,
  normalizeBridgeUrl,
  toBridgeModelId
} from "../src/adapters/mastra/claudeOauthGateway.js";
import type { LanguageModelV2 } from "@ai-sdk/provider-v5";
import { ModelRouterLanguageModel } from "@mastra/core/llm";

describe("Claude OAuth Mastra gateway", () => {
  it("exposes the claude-oauth provider and bridge model ids", async () => {
    const gateway = new ClaudeOauthMastraGateway({
      bridgeUrl: "http://bridge.local:8787",
      bridgeApiKey: "bridge-secret"
    });

    await expect(gateway.fetchProviders()).resolves.toEqual({
      "claude-oauth": {
        name: "Claude OAuth Bridge",
        models: ["sonnet", "sonnet-high"],
        apiKeyEnvVar: "CLAUDE_OAUTH_BRIDGE_API_KEY",
        gateway: "claude-oauth",
        url: "http://bridge.local:8787/v1"
      }
    });
  });

  it("normalizes bridge URLs to the OpenAI-compatible /v1 base", () => {
    expect(normalizeBridgeUrl("http://localhost:8787")).toBe("http://localhost:8787/v1");
    expect(normalizeBridgeUrl("http://localhost:8787/")).toBe("http://localhost:8787/v1");
    expect(normalizeBridgeUrl("http://localhost:8787/v1")).toBe("http://localhost:8787/v1");
  });

  it("maps Mastra model inputs to bridge model ids", () => {
    expect(toBridgeModelId("claude-oauth/sonnet")).toBe("claude-oauth/sonnet");
    expect(toBridgeModelId("sonnet")).toBe("claude-oauth/sonnet");
    expect(toBridgeModelId("sonnet-high")).toBe("claude-oauth/sonnet-high");
  });

  it("rejects unsupported model ids", () => {
    expect(() => toBridgeModelId("claude-oauth/opus")).toThrow(/model_not_supported/);
  });

  it("copies only adapter bridge env values and does not expose Claude OAuth", async () => {
    const gateway = new ClaudeOauthMastraGateway({
      bridgeUrl: "http://localhost:8787",
      env: {
        UNRELATED_CALLER_SECRET: "must-not-read",
        CLAUDE_OAUTH_BRIDGE_API_KEY: "bridge-secret"
      }
    });

    await expect(gateway.getApiKey("claude-oauth/sonnet")).resolves.toBe("bridge-secret");
    expect(gateway.serializeForSpan()).toEqual({
      id: "claude-oauth",
      name: "Claude OAuth Bridge"
    });
  });

  it("allows construction when the local bridge has auth disabled", async () => {
    const gateway = new ClaudeOauthMastraGateway({
      bridgeUrl: "http://localhost:8787",
      env: {}
    });

    await expect(gateway.getApiKey("claude-oauth/sonnet")).resolves.toBe("bridge-auth-disabled");
  });

  it("creates an AI SDK language model pointed at the bridge", async () => {
    const gateway = new ClaudeOauthMastraGateway({
      bridgeUrl: "http://localhost:8787",
      bridgeApiKey: "bridge-secret"
    });
    const model = await gateway.resolveLanguageModel({
      modelId: "claude-oauth/sonnet",
      providerId: "claude-oauth",
      apiKey: "bridge-secret"
    });

    expect(model.provider).toBe("claude-oauth.chat");
    expect(model.modelId).toBe("claude-oauth/sonnet");
  });

  it("works through Mastra's ModelRouterLanguageModel using the gateway id shape", async () => {
    const model = new ModelRouterLanguageModel("claude-oauth/claude-oauth/sonnet", [
      new ClaudeOauthMastraGateway({
        bridgeUrl: "http://localhost:8787",
        bridgeApiKey: "bridge-secret",
        customFetch: async () =>
          new Response(
            JSON.stringify({
              id: "chatcmpl_mock",
              object: "chat.completion",
              created: 1,
              model: "sonnet",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "mastra-router-ok" },
                  finish_reason: "stop"
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
      })
    ]);

    const result = await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Reply exactly: mastra-router-ok" }]
        }
      ]
    });

    expect((result as unknown as { content: unknown }).content).toEqual([
      { type: "text", text: "mastra-router-ok" }
    ]);
  });

  it("creates a direct Mastra-compatible model for agents that do not use gateway registry", () => {
    const model = createClaudeOauthMastraModel("claude-oauth/sonnet-high", {
      bridgeUrl: "http://localhost:8787",
      bridgeApiKey: "bridge-secret"
    });

    expect(model.provider).toBe("claude-oauth.chat");
    expect(model.modelId).toBe("claude-oauth/sonnet-high");
  });

  it("sends generate requests to the bridge OpenAI-compatible endpoint", async () => {
    const calls: Array<{ url: string; body: { model: string }; authorization: string | null }> = [];
    const model = createClaudeOauthMastraModel("claude-oauth/sonnet", {
      bridgeUrl: "http://localhost:8787",
      bridgeApiKey: "bridge-secret",
      customFetch: async (input, init) => {
        calls.push({
          url: input.toString(),
          body: JSON.parse(init?.body?.toString() ?? "{}") as { model: string },
          authorization: new Headers(init?.headers).get("authorization")
        });
        return new Response(
          JSON.stringify({
            id: "chatcmpl_mock",
            object: "chat.completion",
            created: 1,
            model: "claude-oauth/sonnet",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "mastra-oauth-ok" },
                finish_reason: "stop"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    }) as LanguageModelV2;

    const result = await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Reply exactly: mastra-oauth-ok" }]
        }
      ]
    });

    expect(calls[0]).toMatchObject({
      url: "http://localhost:8787/v1/chat/completions",
      body: { model: "claude-oauth/sonnet" },
      authorization: "Bearer bridge-secret"
    });
    expect(result.content).toEqual([{ type: "text", text: "mastra-oauth-ok" }]);
  });

  it("documents current adapter limitations", () => {
    expect(CLAUDE_OAUTH_MASTRA_MODELS).toEqual([
      {
        id: "claude-oauth/sonnet",
        mastraModel: "sonnet",
        bridgeModel: "claude-oauth/sonnet",
        toolCalls: "unsupported",
        streaming: "unsupported"
      },
      {
        id: "claude-oauth/sonnet-high",
        mastraModel: "sonnet-high",
        bridgeModel: "claude-oauth/sonnet-high",
        toolCalls: "unsupported",
        streaming: "unsupported"
      }
    ]);
  });

  it("throws clear adapter errors for unsupported tool calls and streaming", () => {
    expect(() => rejectUnsupportedBridgeRequest({ tools: [{ type: "function" }] })).toThrow(
      /tool_use_not_supported/
    );
    expect(() => rejectUnsupportedBridgeRequest({ stream: true })).toThrow(/streaming_not_supported/);
  });
});
