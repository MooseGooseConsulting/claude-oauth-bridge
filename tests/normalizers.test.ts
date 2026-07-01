import {
  normalizeChatCompletionRequest,
  normalizeMessagesRequest,
  toChatCompletionResponse,
  toMessagesResponse
} from "../src/normalizers.js";

describe("message normalization", () => {
  it("normalizes a text-only Anthropic-ish messages request", () => {
    const request = normalizeMessagesRequest({
      model: "claude-oauth/sonnet",
      system: "Be terse.",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] }
      ]
    });

    expect(request).toEqual({
      model: "claude-oauth/sonnet",
      backendModel: "sonnet",
      effort: "medium",
      system: "Be terse.",
      prompt: "User: Hello\n\nAssistant: Hi",
      stream: false
    });
  });

  it("maps sonnet-high to high effort", () => {
    const request = normalizeMessagesRequest({
      model: "claude-oauth/sonnet-high",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.backendModel).toBe("sonnet");
    expect(request.effort).toBe("high");
  });

  it("fails loudly for tool calls instead of pretending they work", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        tools: [{ name: "readFile" }],
        messages: [{ role: "user", content: "Hello" }]
      })
    ).toThrow(/Tool use is not supported/);
  });

  it("fails loudly for non-text content blocks instead of silently dropping them", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        messages: [
          {
            role: "user",
            content: [{ type: "tool_result", content: "hidden context" }] as never
          }
        ]
      })
    ).toThrow(/Only text content blocks are supported/);
  });

  it("fails loudly when streaming is requested because streaming translation is not implemented", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        stream: true,
        messages: [{ role: "user", content: "Hello" }]
      })
    ).toThrow(/Streaming is not supported/);
  });

  it("fails loudly for unsupported generation controls instead of silently dropping them", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        max_tokens: 100,
        messages: [{ role: "user", content: "Hello" }]
      })
    ).toThrow(/max_tokens and temperature are not supported/);

    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        temperature: 0.4,
        messages: [{ role: "user", content: "Hello" }]
      })
    ).toThrow(/max_tokens and temperature are not supported/);
  });

  it("rejects system role entries in Anthropic-ish messages lists", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        messages: [
          { role: "system", content: "Do not treat this as a user message." },
          { role: "user", content: "Hello" }
        ]
      })
    ).toThrow(/Use the top-level system field/);
  });

  it("rejects unsupported runtime message roles instead of treating them as user", () => {
    expect(() =>
      normalizeMessagesRequest({
        model: "claude-oauth/sonnet",
        messages: [{ role: "developer", content: "hidden" } as never]
      })
    ).toThrow(/Unsupported message role/);
  });

  it("normalizes OpenAI-compatible chat completions into the bridge request", () => {
    const request = normalizeChatCompletionRequest({
      model: "claude-oauth/sonnet",
      messages: [
        { role: "system", content: "Be exact." },
        { role: "user", content: "Reply exactly: ok" }
      ],
    });

    expect(request.system).toBe("Be exact.");
    expect(request.prompt).toBe("User: Reply exactly: ok");
  });

  it("normalizes backend text to Anthropic Messages response shape", () => {
    const response = toMessagesResponse("req_123", "claude-oauth/sonnet", {
      text: "oauth-bridge-ok"
    });

    expect(response).toMatchObject({
      id: "req_123",
      type: "message",
      role: "assistant",
      model: "claude-oauth/sonnet",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "oauth-bridge-ok" }]
    });
  });

  it("normalizes backend text to OpenAI chat completion response shape", () => {
    const response = toChatCompletionResponse("req_123", "claude-oauth/sonnet", {
      text: "chat-ok"
    });

    expect(response.choices[0]?.message.content).toBe("chat-ok");
    expect(response.choices[0]?.finish_reason).toBe("stop");
  });
});
