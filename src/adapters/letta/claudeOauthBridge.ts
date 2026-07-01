export const LETTA_PROVIDER_ID = "claude-oauth-bridge";
export const LETTA_MODEL_HANDLES = ["claude-oauth/sonnet", "claude-oauth/sonnet-high"] as const;

export type LettaModelHandle = (typeof LETTA_MODEL_HANDLES)[number];

export interface LettaOpenAICompatibleConfig {
  provider: typeof LETTA_PROVIDER_ID;
  model: LettaModelHandle;
  baseUrl: string;
  apiKeyEnv: string;
  endpointType: "openai-compatible";
  toolCalls: false;
}

export interface BuildLettaOpenAICompatibleConfigOptions {
  bridgeUrl?: string;
  apiKeyEnv?: string;
  model?: string;
}

export interface LettaBridgeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LettaBridgeChatInput {
  model: string;
  messages: LettaBridgeMessage[];
  tools?: unknown[];
  stream?: boolean;
  memory?: Record<string, unknown>;
}

export interface LettaBridgeChatRequest {
  model: LettaModelHandle;
  messages: LettaBridgeMessage[];
  stream: false;
}

export interface LettaTurnState {
  memory: Record<string, unknown>;
}

export interface LettaBridgeTextResponse {
  text: string;
}

interface OpenAICompatibleBridgeResponse {
  choices?: Array<{
    message?: {
      role?: unknown;
      content?: unknown;
    };
  }>;
}

const DEFAULT_BRIDGE_URL = "http://localhost:8787";
const DEFAULT_BRIDGE_KEY_ENV = "CLAUDE_OAUTH_BRIDGE_API_KEY";

export function buildLettaOpenAICompatibleConfig(
  options: BuildLettaOpenAICompatibleConfigOptions = {}
): LettaOpenAICompatibleConfig {
  return {
    provider: LETTA_PROVIDER_ID,
    model: toLettaModelHandle(options.model ?? "sonnet"),
    baseUrl: normalizeLettaBridgeUrl(options.bridgeUrl),
    apiKeyEnv: options.apiKeyEnv ?? DEFAULT_BRIDGE_KEY_ENV,
    endpointType: "openai-compatible",
    toolCalls: false
  };
}

export function normalizeLettaBridgeUrl(bridgeUrl: string | undefined): string {
  const trimmed = (bridgeUrl?.trim() || DEFAULT_BRIDGE_URL).replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function toLettaModelHandle(model: string): LettaModelHandle {
  if (model === "sonnet") {
    return "claude-oauth/sonnet";
  }

  if (model === "sonnet-high") {
    return "claude-oauth/sonnet-high";
  }

  if (isLettaModelHandle(model)) {
    return model;
  }

  throw new Error(`Unsupported Letta bridge model: ${model}`);
}

export function toLettaBridgeChatRequest(input: LettaBridgeChatInput): LettaBridgeChatRequest {
  rejectUnsupportedLettaTools(input.tools);

  if (input.stream === true) {
    throw new Error("Streaming is not supported by claude-oauth-bridge Letta helpers");
  }

  return {
    model: toLettaModelHandle(input.model),
    messages: input.messages,
    stream: false
  };
}

export function buildLettaTurnState(
  previousMemory: Record<string, unknown> | undefined,
  updates: Record<string, unknown>
): LettaTurnState {
  return {
    memory: {
      ...(previousMemory ?? {}),
      ...updates
    }
  };
}

export function rejectUnsupportedLettaTools(tools: unknown[] | undefined): void {
  if (Array.isArray(tools) && tools.length > 0) {
    throw new Error("Tool calls are not supported by claude-oauth-bridge text-only mode");
  }
}

export function parseLettaBridgeResponse(response: OpenAICompatibleBridgeResponse): LettaBridgeTextResponse {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Bridge response did not include assistant text");
  }

  return { text: content };
}

function isLettaModelHandle(model: string): model is LettaModelHandle {
  return (LETTA_MODEL_HANDLES as readonly string[]).includes(model);
}
