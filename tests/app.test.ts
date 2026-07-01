import { createBridgeApp } from "../src/app.js";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("uses local Claude Code credentials as the default OAuth probe", () => {
    const root = mkdtempSync(join(tmpdir(), "claude-app-creds-"));
    const claudeDir = join(root, ".claude");
    mkdirSync(claudeDir);
    writeFileSync(join(claudeDir, ".credentials.json"), "{\"note\":\"present\"}");

    try {
      const { config } = createBridgeApp({
        env: {
          BRIDGE_AUTH_DISABLED: "1",
          HOME: root,
          USERPROFILE: root
        }
      });

      expect(config.oauthConfigured).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("wires production request logging", async () => {
    const events: unknown[] = [];
    const { server } = createBridgeApp({
      env: {
        BRIDGE_AUTH_DISABLED: "1"
      },
      logger: (event) => events.push(event)
    });

    server.listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
    } finally {
      server.close();
      await once(server, "close");
    }

    expect(events).toContainEqual(expect.objectContaining({ event: "request_completed", path: "/health" }));
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
