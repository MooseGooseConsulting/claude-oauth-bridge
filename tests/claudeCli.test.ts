import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";

import { ClaudeCliBackend, buildClaudeArgs, collectStream, parseClaudeStreamJson } from "../src/backend/claudeCli.js";

describe("Claude CLI backend", () => {
  it("parses stream-json assistant text events", () => {
    const text = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "hello " }]
        }
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "world" }]
        }
      })
    ].join("\n");

    expect(parseClaudeStreamJson(text)).toEqual({ text: "hello world" });
  });

  it("parses final result text when present", () => {
    const text = JSON.stringify({
      type: "result",
      result: "oauth-bridge-ok"
    });

    expect(parseClaudeStreamJson(text)).toEqual({ text: "oauth-bridge-ok" });
  });

  it("falls back to assistant text when the final result frame is empty", () => {
    const text = [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "assistant-ok" }]
        }
      }),
      JSON.stringify({
        type: "result",
        result: ""
      })
    ].join("\n");

    expect(parseClaudeStreamJson(text)).toEqual({ text: "assistant-ok" });
  });

  it("rejects empty successful CLI output", () => {
    expect(() => parseClaudeStreamJson("")).toThrow(/claude_cli_empty_response/);
  });

  it("removes Anthropic API-key env vars while preserving Claude OAuth", async () => {
    const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
    const fakeChild = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: () => void;
    };
    fakeChild.stdout = Readable.from([
      `${JSON.stringify({ type: "result", result: "ok" })}\n`
    ]);
    fakeChild.stderr = Readable.from([]);
    fakeChild.kill = vi.fn();

    const backend = new ClaudeCliBackend({
      spawn(command, args, options) {
        calls.push({
          command,
          args,
          env: options.env as NodeJS.ProcessEnv
        });
        queueMicrotask(() => fakeChild.emit("close", 0));
        return fakeChild as unknown as ChildProcess;
      },
      env: {
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-secret",
        ANTHROPIC_API_KEY: "api-key-secret",
        ANTHROPIC_AUTH_TOKEN: "auth-secret",
        SAFE_ENV: "kept"
      },
      timeoutMs: 1_000
    });

    await expect(
      backend.complete({
        model: "sonnet",
        effort: "medium",
        prompt: "Reply ok",
        stream: false
      })
    ).resolves.toEqual({ text: "ok" });

    expect(calls[0]?.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-secret");
    expect(calls[0]?.env.SAFE_ENV).toBe("kept");
    expect(calls[0]?.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(calls[0]?.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(calls[0]?.args).toContain("--output-format");
    expect(calls[0]?.args).toContain("stream-json");
  });

  it("uses OAuth-compatible safe mode and disables tools for provider calls", () => {
    const args = buildClaudeArgs({
      model: "sonnet",
      effort: "medium",
      prompt: "Reply ok",
      stream: false,
      disableTools: true
    });

    expect(args).toContain("--safe-mode");
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).not.toContain("--bare");
  });

  it("keeps tools enabled for job-native calls", () => {
    const args = buildClaudeArgs({
      model: "sonnet",
      effort: "high",
      prompt: "Review the repo",
      stream: false
    });

    expect(args).toContain("--safe-mode");
    expect(args).not.toContain("--tools");
    expect(args).not.toContain("--bare");
  });

  it("rejects Claude output over the configured limit", async () => {
    const fakeChild = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: () => void;
    };
    fakeChild.stdout = Readable.from(["0123456789"]);
    fakeChild.stderr = Readable.from([]);
    fakeChild.kill = vi.fn();

    const backend = new ClaudeCliBackend({
      spawn() {
        queueMicrotask(() => fakeChild.emit("close", 0));
        return fakeChild as unknown as ChildProcess;
      },
      timeoutMs: 1_000,
      maxOutputBytes: 4
    });

    await expect(
      backend.complete({
        model: "sonnet",
        effort: "medium",
        prompt: "Reply ok",
        stream: false
      })
    ).rejects.toThrow(/claude_cli_output_too_large/);
    expect(fakeChild.kill).toHaveBeenCalled();
  });

  it("collects stream chunks up to the byte limit", async () => {
    const text = await collectStream(Readable.from(["hello", " world"]), 11);

    expect(text).toBe("hello world");
  });

  it("redacts stderr from failed CLI errors", async () => {
    const fakeChild = new EventEmitter() as EventEmitter & {
      stdout: Readable;
      stderr: Readable;
      kill: () => void;
    };
    fakeChild.stdout = Readable.from([]);
    fakeChild.stderr = Readable.from(["token oauth-secret"]);
    fakeChild.kill = vi.fn();
    const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-secret";

    try {
      const backend = new ClaudeCliBackend({
        spawn() {
          queueMicrotask(() => fakeChild.emit("close", 1));
          return fakeChild as unknown as ChildProcess;
        },
        timeoutMs: 1_000
      });

      await expect(
        backend.complete({
          model: "sonnet",
          effort: "medium",
          prompt: "Reply ok",
          stream: false
        })
      ).rejects.not.toThrow(/oauth-secret/);
    } finally {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
    }
  });
});
