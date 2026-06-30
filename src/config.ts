export interface BridgeConfig {
  backend: "claude-cli";
  oauthConfigured: boolean;
  port: number;
  host: string;
  bridgeApiKey?: string;
  requestTimeoutMs: number;
  concurrency: number;
  maxQueueSize: number;
  maxRequestBytes: number;
  maxOutputBytes: number;
  allowedWorkspaceRoots: string[];
}

export interface CredentialProbe {
  hasLocalClaudeCredentials: () => boolean;
}

export type ConfigEnv = Partial<Record<string, string | undefined>>;

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_QUEUE_SIZE = 16;
const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function loadConfig(
  env: ConfigEnv = process.env,
  probe?: CredentialProbe
): BridgeConfig {
  const host = hasText(env.HOST) ? env.HOST.trim() : DEFAULT_HOST;
  const bridgeApiKey = hasText(env.BRIDGE_API_KEY) ? env.BRIDGE_API_KEY : undefined;
  if (!isLoopbackHost(host) && bridgeApiKey === undefined) {
    throw new Error("bridge_api_key_required: BRIDGE_API_KEY is required when HOST is not loopback");
  }

  return {
    backend: "claude-cli",
    oauthConfigured: hasOauthConfiguration(env, probe),
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT),
    host,
    bridgeApiKey,
    requestTimeoutMs: parsePositiveInteger(env.REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    concurrency: parsePositiveInteger(env.CONCURRENCY, DEFAULT_CONCURRENCY),
    maxQueueSize: parsePositiveInteger(env.MAX_QUEUE_SIZE, DEFAULT_MAX_QUEUE_SIZE),
    maxRequestBytes: parsePositiveInteger(env.MAX_REQUEST_BYTES, DEFAULT_MAX_REQUEST_BYTES),
    maxOutputBytes: parsePositiveInteger(env.MAX_OUTPUT_BYTES, DEFAULT_MAX_OUTPUT_BYTES),
    allowedWorkspaceRoots: parseList(env.CLAUDE_OAUTH_ALLOWED_WORKSPACES, [process.cwd()])
  };
}

function hasOauthConfiguration(env: ConfigEnv, probe?: CredentialProbe): boolean {
  if (hasText(env.CLAUDE_CODE_OAUTH_TOKEN)) {
    return true;
  }

  return probe?.hasLocalClaudeCredentials() ?? false;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!hasText(value)) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!hasText(value)) {
    return fallback;
  }

  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
