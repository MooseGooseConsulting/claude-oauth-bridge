import { loadConfig } from "../src/config.js";
import { redactSecrets } from "../src/redaction.js";

describe("configuration and secret boundaries", () => {
  it("reports OAuth configured when CLAUDE_CODE_OAUTH_TOKEN is present", () => {
    const config = loadConfig({
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
      PORT: "9999"
    });

    expect(config.oauthConfigured).toBe(true);
    expect(config.port).toBe(9999);
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

  it("redacts Claude and Anthropic credential values from logs", () => {
    const redacted = redactSecrets({
      CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
      ANTHROPIC_API_KEY: "api-key-secret",
      ANTHROPIC_AUTH_TOKEN: "auth-secret",
      safe: "visible"
    });

    expect(redacted).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "[REDACTED]",
      ANTHROPIC_API_KEY: "[REDACTED]",
      ANTHROPIC_AUTH_TOKEN: "[REDACTED]",
      safe: "visible"
    });
  });
});
