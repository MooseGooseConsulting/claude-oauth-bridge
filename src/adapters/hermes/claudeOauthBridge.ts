export const HERMES_PROVIDER_ID = "claude-oauth-bridge";
export const HERMES_MODEL_IDS = ["claude-oauth/sonnet", "claude-oauth/sonnet-high"] as const;

export type HermesModelId = (typeof HERMES_MODEL_IDS)[number];

export interface HermesCustomProviderModel {
  context_length: number;
}

export interface HermesCustomProviderConfig {
  name: typeof HERMES_PROVIDER_ID;
  base_url: string;
  key_env: string;
  api_mode: "openai";
  model: HermesModelId;
  models: Record<HermesModelId, HermesCustomProviderModel>;
}

export interface BuildHermesCustomProviderOptions {
  bridgeUrl?: string;
  apiKeyEnv?: string;
  defaultModel?: string;
  contextLength?: number;
}

export interface HermesBridgeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HermesBridgeChatInput {
  model: string;
  messages: HermesBridgeMessage[];
  tools?: unknown[];
  stream?: boolean;
}

export interface HermesBridgeChatRequest {
  model: HermesModelId;
  messages: HermesBridgeMessage[];
  stream: false;
}

export interface HermesBridgeTextResponse {
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

const DEFAULT_CONTEXT_LENGTH = 200000;
const DEFAULT_BRIDGE_URL = "http://localhost:8787";
const DEFAULT_BRIDGE_KEY_ENV = "CLAUDE_OAUTH_BRIDGE_API_KEY";

export function buildHermesCustomProvider(
  options: BuildHermesCustomProviderOptions = {}
): HermesCustomProviderConfig {
  const model = toHermesModelId(options.defaultModel ?? "sonnet");
  const contextLength = options.contextLength ?? DEFAULT_CONTEXT_LENGTH;

  return {
    name: HERMES_PROVIDER_ID,
    base_url: normalizeHermesBridgeUrl(options.bridgeUrl),
    key_env: options.apiKeyEnv ?? DEFAULT_BRIDGE_KEY_ENV,
    api_mode: "openai",
    model,
    models: {
      "claude-oauth/sonnet": { context_length: contextLength },
      "claude-oauth/sonnet-high": { context_length: contextLength }
    }
  };
}

export function normalizeHermesBridgeUrl(bridgeUrl: string | undefined): string {
  const trimmed = (bridgeUrl?.trim() || DEFAULT_BRIDGE_URL).replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function toHermesModelId(model: string): HermesModelId {
  if (model === "sonnet") {
    return "claude-oauth/sonnet";
  }

  if (model === "sonnet-high") {
    return "claude-oauth/sonnet-high";
  }

  if (isHermesModelId(model)) {
    return model;
  }

  throw new Error(`Unsupported Hermes bridge model: ${model}`);
}

export function toHermesBridgeChatRequest(input: HermesBridgeChatInput): HermesBridgeChatRequest {
  rejectUnsupportedHermesTools(input.tools);

  if (input.stream === true) {
    throw new Error("Streaming is not supported by claude-oauth-bridge Hermes helpers");
  }

  return {
    model: toHermesModelId(input.model),
    messages: input.messages,
    stream: false
  };
}

export function rejectUnsupportedHermesTools(tools: unknown[] | undefined): void {
  if (Array.isArray(tools) && tools.length > 0) {
    throw new Error("Tool calls are not supported by claude-oauth-bridge text-only mode");
  }
}

export function parseHermesBridgeResponse(response: OpenAICompatibleBridgeResponse): HermesBridgeTextResponse {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Bridge response did not include assistant text");
  }

  return { text: content };
}

function isHermesModelId(model: string): model is HermesModelId {
  return (HERMES_MODEL_IDS as readonly string[]).includes(model);
}
