export interface BridgeConfig {
  backend: "claude-cli";
  oauthConfigured: boolean;
  port: number;
  requestTimeoutMs: number;
  concurrency: number;
}

export interface CredentialProbe {
  hasLocalClaudeCredentials: () => boolean;
}

export type ConfigEnv = Partial<Record<string, string | undefined>>;

const DEFAULT_PORT = 8787;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 2;

export function loadConfig(
  env: ConfigEnv = process.env,
  probe?: CredentialProbe
): BridgeConfig {
  return {
    backend: "claude-cli",
    oauthConfigured: hasOauthConfiguration(env, probe),
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT),
    requestTimeoutMs: parsePositiveInteger(env.REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    concurrency: parsePositiveInteger(env.CONCURRENCY, DEFAULT_CONCURRENCY)
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
