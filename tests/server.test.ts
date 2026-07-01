import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { createBridgeServer } from "../src/server.js";
import type { BridgeBackend } from "../src/backend/types.js";

interface ModelListResponse {
  data: Array<{ id: string }>;
}

interface MessageResponse {
  model: string;
  content: Array<{ text: string }>;
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string } }>;
}

const backend: BridgeBackend = {
  name: "mock",
  async complete(request) {
    return { text: `${request.model}:${request.prompt}` };
  }
};

type TestConfigOverrides = Partial<Parameters<typeof createBridgeServer>[0]["config"]>;

async function withServer<T>(
  fn: (baseUrl: string) => Promise<T>,
  overrides: TestConfigOverrides = {},
  logger?: Parameters<typeof createBridgeServer>[0]["logger"]
): Promise<T> {
  const server = createBridgeServer({
    backend,
    config: {
      backend: "claude-cli",
      oauthConfigured: true,
      port: 0,
      host: "127.0.0.1",
      requestTimeoutMs: 30_000,
      concurrency: 2,
      maxQueueSize: 4,
      maxRequestBytes: 1024,
      maxOutputBytes: 1024 * 1024,
      allowedWorkspaceRoots: [process.cwd()],
      bridgeApiKey: undefined,
      ...overrides
    },
    logger
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
      const body = (await response.json()) as ModelListResponse;

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

      const body = (await response.json()) as MessageResponse;
      expect(response.headers.get("x-request-id")).toMatch(/^req_/);
      expect(body.content[0].text).toContain("oauth-bridge-ok");
      expect(body.model).toBe("claude-oauth/sonnet");
    });
  });

  it("returns oauth_not_configured before invoking the backend", async () => {
    let calls = 0;
    const missingOauthBackend: BridgeBackend = {
      name: "mock",
      async complete() {
        calls += 1;
        return { text: "should not run" };
      }
    };
    const server = createBridgeServer({
      backend: missingOauthBackend,
      config: {
        backend: "claude-cli",
        oauthConfigured: false,
        port: 0,
        host: "127.0.0.1",
        requestTimeoutMs: 30_000,
        concurrency: 2,
        maxQueueSize: 4,
        maxRequestBytes: 1024,
        maxOutputBytes: 1024 * 1024,
        allowedWorkspaceRoots: [process.cwd()]
      }
    });
    server.listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-oauth/sonnet",
          messages: [{ role: "user", content: "Hello" }]
        })
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "oauth_not_configured" }
      });
      expect(calls).toBe(0);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("requires bridge auth when an API key is configured", async () => {
    await withServer(
      async (baseUrl) => {
        const unauthorized = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "Hello" }]
          })
        });
        expect(unauthorized.status).toBe(401);

        const authorized = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer bridge-secret"
          },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "Hello" }]
          })
        });
        expect(authorized.status).toBe(200);
      },
      { bridgeApiKey: "bridge-secret" }
    );
  });

  it("accepts repeated x-bridge-api-key headers when one value is valid", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: [
            ["content-type", "application/json"],
            ["x-bridge-api-key", "wrong"],
            ["x-bridge-api-key", "bridge-secret"]
          ],
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "Hello" }]
          })
        });

        expect(response.status).toBe(200);
      },
      { bridgeApiKey: "bridge-secret" }
    );
  });

  it("rejects text/plain POSTs when bridge auth is required", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "Hello" }]
          })
        });

        expect(response.status).toBe(401);
      },
      { bridgeApiKey: "bridge-secret" }
    );
  });

  it("rejects non-JSON POST bodies before parsing", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({
          model: "claude-oauth/sonnet",
          messages: [{ role: "user", content: "Hello" }]
        })
      });

      expect(response.status).toBe(415);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "unsupported_media_type" }
      });
    });
  });

  it("isolates logger failures from request handling", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`);

        expect(response.status).toBe(200);
      },
      {},
      () => {
        throw new Error("logger failed");
      }
    );
  });

  it("destroys unauthorized POST bodies when auth fails before reading JSON", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "x".repeat(200) }]
          })
        });

        expect(response.status).toBe(401);
      },
      { bridgeApiKey: "bridge-secret" }
    );
  });

  it("rejects request bodies over the configured limit", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "x".repeat(200) }]
          })
        });

        expect(response.status).toBe(413);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "request_too_large" }
        });
      },
      { maxRequestBytes: 80 }
    );
  });

  it("destroys oversized request streams after returning request_too_large", async () => {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "claude-oauth/sonnet",
            messages: [{ role: "user", content: "x".repeat(200) }]
          })
        });

        expect(response.status).toBe(413);
      },
      { maxRequestBytes: 80 }
    );
  });

  it("emits structured request logs without secret values", async () => {
    const events: unknown[] = [];
    await withServer(
      async (baseUrl) => {
        await fetch(`${baseUrl}/health`);
      },
      { bridgeApiKey: "bridge-secret" },
      (event) => events.push(event)
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "request_completed",
        method: "GET",
        path: "/health",
        status: 200
      })
    );
    expect(JSON.stringify(events)).not.toContain("bridge-secret");
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

      const body = (await response.json()) as ChatCompletionResponse;
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

  it("trims validated job string fields before building prompts", async () => {
    const calls: string[] = [];
    const trimBackend: BridgeBackend = {
      name: "mock",
      async complete(request) {
        calls.push(request.prompt);
        return { text: '{"summary":"ok"}' };
      }
    };
    const server = createBridgeServer({
      backend: trimBackend,
      config: {
        backend: "claude-cli",
        oauthConfigured: true,
        port: 0,
        host: "127.0.0.1",
        requestTimeoutMs: 30_000,
        concurrency: 2,
        maxQueueSize: 4,
        maxRequestBytes: 1024,
        maxOutputBytes: 1024 * 1024,
        allowedWorkspaceRoots: [process.cwd()],
        bridgeApiKey: undefined
      }
    });
    server.listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/jobs/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace: ` ${process.cwd()} `,
          repoFullName: " owner/repo ",
          prNumber: 1
        })
      });

      expect(response.status).toBe(200);
      expect(calls[0]).toContain("repository owner/repo");
      expect(calls[0]).not.toContain("repository  owner/repo");
      expect(calls[0]).not.toContain("owner/repo  at workspace");
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
