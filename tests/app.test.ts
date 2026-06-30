import { createBridgeApp } from "../src/app.js";

describe("bridge app wiring", () => {
  it("creates a server with the claude-cli backend", () => {
    const { server, backend, config } = createBridgeApp({
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
        PORT: "9911"
      }
    });

    expect(server.listening).toBe(false);
    expect(backend.name).toBe("claude-cli");
    expect(config.port).toBe(9911);
    expect(config.host).toBe("127.0.0.1");
    expect(config.bridgeApiKey).toBeDefined();
    expect(config.oauthConfigured).toBe(true);
  });

  it("wires production request logging", () => {
    const events: unknown[] = [];
    const { server } = createBridgeApp({
      env: {
        BRIDGE_AUTH_DISABLED: "1"
      },
      logger: (event) => events.push(event)
    });

    expect(server.listening).toBe(false);
    expect(events).toEqual([]);
  });
});
