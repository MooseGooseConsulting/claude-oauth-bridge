import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { createBridgeServer } from "../src/server.js";
import type { BridgeBackend } from "../src/backend/types.js";

const backend: BridgeBackend = {
  name: "mock",
  async complete(request) {
    return { text: `${request.model}:${request.prompt}` };
  }
};

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createBridgeServer({
    backend,
    config: {
      backend: "claude-cli",
      oauthConfigured: true,
      port: 0,
      requestTimeoutMs: 30_000,
      concurrency: 2
    }
  });
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("bridge HTTP server", () => {
  it("serves health with backend and OAuth state", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        backend: "claude-cli",
        oauthConfigured: true
      });
    });
  });

  it("lists bridge model ids", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/models`);
      const body = await response.json();

      expect(body.data.map((model: { id: string }) => model.id)).toEqual([
        "claude-oauth/sonnet",
        "claude-oauth/sonnet-high"
      ]);
    });
  });

  it("handles /v1/messages through the injected backend", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-oauth/sonnet",
          messages: [{ role: "user", content: "Reply exactly: oauth-bridge-ok" }]
        })
      });

      const body = await response.json();
      expect(body.content[0].text).toContain("oauth-bridge-ok");
      expect(body.model).toBe("claude-oauth/sonnet");
    });
  });

  it("handles /v1/chat/completions through the injected backend", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-oauth/sonnet",
          messages: [{ role: "user", content: "Reply exactly: chat-ok" }]
        })
      });

      const body = await response.json();
      expect(body.choices[0].message.content).toContain("chat-ok");
    });
  });

  it("returns an explicit unsupported error for tools", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-oauth/sonnet",
          tools: [{ name: "readFile" }],
          messages: [{ role: "user", content: "Use a tool" }]
        })
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "tool_use_not_supported" }
      });
    });
  });
});
