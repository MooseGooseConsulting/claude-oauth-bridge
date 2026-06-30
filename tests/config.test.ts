import { loadConfig } from "../src/config.js";
import { redactSecrets } from "../src/redaction.js";

describe("configuration and secret boundaries", () => {
  it("reports OAuth configured when CLAUDE_CODE_OAUTH_TOKEN is present", () => {
    const config = loadConfig({
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
      PORT: "9999",
      HOST: "127.0.0.1",
      BRIDGE_API_KEY: "bridge-secret",
      CLAUDE_OAUTH_ALLOWED_WORKSPACES: "D:\\repos;D:\\work"
    });

    expect(config.oauthConfigured).toBe(true);
    expect(config.port).toBe(9999);
    expect(config.host).toBe("127.0.0.1");
    expect(config.bridgeApiKey).toBe("bridge-secret");
    expect(config.allowedWorkspaceRoots).toEqual(["D:\\repos", "D:\\work"]);
  });

  it("reports OAuth missing when neither token nor local credential probe is present", () => {
    const config = loadConfig({}, { hasLocalClaudeCredentials: () => false });

    expect(config.oauthConfigured).toBe(false);
  });

  it("does not treat ANTHROPIC_API_KEY as OAuth configuration", () => {
    const config = loadConfig(
      { ANTHROPIC_API_KEY: "api-key-secret" },
      { hasLocalClaudeCredentials: () => false }
    );

    expect(config.oauthConfigured).toBe(false);
  });

  it("defaults to loopback binding and bounded request sizes", () => {
    const config = loadConfig({}, { hasLocalClaudeCredentials: () => false });

    expect(config.host).toBe("127.0.0.1");
    expect(config.bridgeApiKey).toBeDefined();
    expect(config.bridgeApiKey).not.toHaveLength(0);
    expect(config.maxRequestBytes).toBeGreaterThan(0);
    expect(config.maxQueueSize).toBeGreaterThan(0);
    expect(config.maxOutputBytes).toBeGreaterThan(0);
    expect(config.allowedWorkspaceRoots).toContain(process.cwd());
  });

  it("rejects non-loopback binding unless bridge API key is configured", () => {
    expect(() =>
      loadConfig({ HOST: "0.0.0.0" }, { hasLocalClaudeCredentials: () => false })
    ).toThrow(/bridge_api_key_required/);
  });

  it("allows explicit opt-out of bridge auth only on loopback", () => {
    const config = loadConfig(
      { BRIDGE_AUTH_DISABLED: "1", HOST: "127.0.0.1" },
      { hasLocalClaudeCredentials: () => false }
    );

    expect(config.bridgeApiKey).toBeUndefined();
  });

  it("redacts Claude and Anthropic credential values from logs", () => {
    const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-secret";
    const redacted = redactSecrets({
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
      ANTHROPIC_API_KEY: "api-key-secret",
      ANTHROPIC_AUTH_TOKEN: "auth-secret",
      safe: "visible",
      nested: {
        message: "token oauth-secret should not appear"
      }
    });

    try {
      expect(redacted).toEqual({
        CLAUDE_CODE_OAUTH_TOKEN: "[REDACTED]",
        ANTHROPIC_API_KEY: "[REDACTED]",
        ANTHROPIC_AUTH_TOKEN: "[REDACTED]",
        safe: "visible",
        nested: {
          message: "token [REDACTED] should not appear"
        }
      });
    } finally {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
    }
  });
});
