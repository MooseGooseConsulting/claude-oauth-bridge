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
      max_tokens: 123,
      temperature: 0,
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
      maxTokens: 123,
      temperature: 0,
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
    ).toThrow(/tool_use_not_supported/);
  });

  it("normalizes OpenAI-compatible chat completions into the bridge request", () => {
    const request = normalizeChatCompletionRequest({
      model: "claude-oauth/sonnet",
      messages: [
        { role: "system", content: "Be exact." },
        { role: "user", content: "Reply exactly: ok" }
      ],
      max_tokens: 20,
      temperature: 0
    });

    expect(request.system).toBe("Be exact.");
    expect(request.prompt).toBe("User: Reply exactly: ok");
    expect(request.maxTokens).toBe(20);
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
