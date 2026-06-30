import { MastraModelGateway, type GatewayLanguageModel, type ProviderConfig } from "@mastra/core/llm";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible-v5";
import type { FetchFunction } from "@ai-sdk/provider-utils-v5";

export type ClaudeOauthMastraModelId = "claude-oauth/sonnet" | "claude-oauth/sonnet-high";

export interface ClaudeOauthMastraGatewayOptions {
  bridgeUrl?: string;
  bridgeApiKey?: string;
  env?: Partial<Record<string, string | undefined>>;
  customFetch?: FetchFunction;
}

export interface ClaudeOauthMastraModelInfo {
  id: ClaudeOauthMastraModelId;
  mastraModel: "sonnet" | "sonnet-high";
  bridgeModel: ClaudeOauthMastraModelId;
  toolCalls: "unsupported";
  streaming: "unsupported";
}

export const CLAUDE_OAUTH_MASTRA_MODELS: ClaudeOauthMastraModelInfo[] = [
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
];

const DEFAULT_BRIDGE_URL = "http://localhost:8787";
const PROVIDER_ID = "claude-oauth";
const PROVIDER_NAME = "Claude OAuth Bridge";
const BRIDGE_URL_ENV = "CLAUDE_OAUTH_BRIDGE_URL";
const BRIDGE_API_KEY_ENV = "CLAUDE_OAUTH_BRIDGE_API_KEY";

export class ClaudeOauthMastraGateway extends MastraModelGateway {
  readonly id = PROVIDER_ID;
  readonly name = PROVIDER_NAME;

  private readonly bridgeUrl?: string;
  private readonly bridgeApiKey?: string;
  private readonly env: Partial<Record<string, string | undefined>>;
  private readonly customFetch?: FetchFunction;

  constructor(options: ClaudeOauthMastraGatewayOptions = {}) {
    super();
    this.bridgeUrl = options.bridgeUrl;
    this.bridgeApiKey = options.bridgeApiKey;
    this.env = options.env ?? process.env;
    this.customFetch = options.customFetch;
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      [PROVIDER_ID]: {
        name: PROVIDER_NAME,
        models: CLAUDE_OAUTH_MASTRA_MODELS.map((model) => model.mastraModel),
        apiKeyEnvVar: BRIDGE_API_KEY_ENV,
        gateway: this.id,
        url: this.resolveBridgeBaseUrl()
      }
    };
  }

  buildUrl(_modelId: string, _envVars: Record<string, string> = {}): string {
    return this.resolveBridgeBaseUrl();
  }

  async getApiKey(_modelId: string): Promise<string> {
    const apiKey = this.bridgeApiKey ?? this.env[BRIDGE_API_KEY_ENV];
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(`Missing ${BRIDGE_API_KEY_ENV}. Set it to the bridge API key or disable bridge auth for local tests.`);
    }
    return apiKey;
  }

  override handlesModel(modelId: string): boolean {
    try {
      toBridgeModelId(modelId);
      return true;
    } catch {
      return false;
    }
  }

  async resolveLanguageModel({
    modelId,
    apiKey
  }: {
    modelId: string;
    providerId: string;
    apiKey: string;
  }): Promise<GatewayLanguageModel> {
    return createClaudeOauthMastraModel(toBridgeModelId(modelId), {
      bridgeUrl: this.resolveBridgeBaseUrl(),
      bridgeApiKey: apiKey,
      customFetch: this.optionsFetch()
    });
  }

  override serializeForSpan(): { id: string; name: string } {
    return {
      id: this.id,
      name: this.name
    };
  }

  private resolveBridgeBaseUrl(): string {
    return normalizeBridgeUrl(this.bridgeUrl ?? this.env[BRIDGE_URL_ENV] ?? DEFAULT_BRIDGE_URL);
  }

  private optionsFetch(): FetchFunction | undefined {
    return this.customFetch;
  }
}

export function createClaudeOauthMastraModel(
  modelId: string,
  options: ClaudeOauthMastraGatewayOptions = {}
): GatewayLanguageModel {
  const bridgeModelId = toBridgeModelId(modelId);
  const baseURL = normalizeBridgeUrl(
    options.bridgeUrl ?? options.env?.[BRIDGE_URL_ENV] ?? process.env[BRIDGE_URL_ENV] ?? DEFAULT_BRIDGE_URL
  );
  const apiKey =
    options.bridgeApiKey ??
    options.env?.[BRIDGE_API_KEY_ENV] ??
    process.env[BRIDGE_API_KEY_ENV];

  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(`Missing ${BRIDGE_API_KEY_ENV}. Set it to the bridge API key or disable bridge auth for local tests.`);
  }

  return createOpenAICompatible({
    name: PROVIDER_ID,
    apiKey,
    baseURL,
    fetch: options.customFetch,
    transformRequestBody: rejectUnsupportedBridgeRequest,
    supportsStructuredOutputs: false
  }).chatModel(bridgeModelId) as GatewayLanguageModel;
}

export function rejectUnsupportedBridgeRequest(body: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    throw new Error("tool_use_not_supported: Claude OAuth bridge Mastra adapter is text-only");
  }

  if (body.stream === true) {
    throw new Error("streaming_not_supported: Claude OAuth bridge Mastra adapter does not support streaming");
  }

  return body;
}

export function normalizeBridgeUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function toBridgeModelId(modelId: string): ClaudeOauthMastraModelId {
  const normalized = modelId.replace(/^claude-oauth\/claude-oauth\//, "claude-oauth/");

  if (normalized === "sonnet" || normalized === "claude-oauth/sonnet") {
    return "claude-oauth/sonnet";
  }

  if (normalized === "sonnet-high" || normalized === "claude-oauth/sonnet-high") {
    return "claude-oauth/sonnet-high";
  }

  throw new Error(`model_not_supported: Unsupported Claude OAuth bridge model: ${modelId}`);
}
