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

  it("redacts secrets in default production logs", () => {
    const writes: string[] = [];
    const originalWrite = process.stdout.write;
    const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-secret";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(chunk.toString());
      return true;
    }) as typeof process.stdout.write;

    try {
      const { server } = createBridgeApp({
        env: {
          BRIDGE_AUTH_DISABLED: "1"
        }
      });
      server.emit("request", { url: "/health", method: "GET", headers: {} }, {
        statusCode: 200,
        headersSent: false,
        writeHead() {},
        end() {}
      });
    } finally {
      process.stdout.write = originalWrite;
      process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
    }

    expect(writes.join("")).not.toContain("oauth-secret");
  });
});
