import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { Readable } from "node:stream";

import type { BackendCompleteRequest, BackendCompleteResult, BridgeBackend } from "./types.js";

type SpawnFunction = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess;

export interface ClaudeCliBackendOptions {
  spawn?: SpawnFunction;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  command?: string;
}

interface StreamJsonLine {
  type?: string;
  result?: unknown;
  message?: {
    content?: Array<{ type?: string; text?: unknown }>;
  };
}

export class ClaudeCliBackend implements BridgeBackend {
  readonly name = "claude-cli";

  private readonly spawn: SpawnFunction;
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private readonly command: string;

  constructor(options: ClaudeCliBackendOptions = {}) {
    this.spawn = options.spawn ?? nodeSpawn;
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.command = options.command ?? "claude";
  }

  async complete(request: BackendCompleteRequest): Promise<BackendCompleteResult> {
    const args = buildClaudeArgs(request);
    const env = buildClaudeEnv(this.env);

    return await new Promise<BackendCompleteResult>((resolve, reject) => {
      const child = this.spawn(this.command, args, {
        cwd: request.cwd,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let settled = false;
      const stdout = collectStream(child.stdout);
      const stderr = collectStream(child.stderr);

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        reject(new Error("claude_cli_timeout"));
      }, this.timeoutMs);

      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        void Promise.all([stdout, stderr])
          .then(([stdoutText, stderrText]) => {
            if (code !== 0) {
              reject(new Error(`claude_cli_failed:${code}:${stderrText.trim()}`));
              return;
            }
            resolve(parseClaudeStreamJson(stdoutText));
          })
          .catch(reject);
      });
    });
  }
}

async function collectStream(stream: Readable | null): Promise<string> {
  if (!stream) {
    return "";
  }

  stream.setEncoding("utf8");
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

export function buildClaudeArgs(request: BackendCompleteRequest): string[] {
  const args = [
    "-p",
    request.prompt,
    "--output-format",
    "stream-json",
    "--model",
    request.model,
    "--effort",
    request.effort,
    "--permission-mode",
    "default",
    "--no-session-persistence"
  ];

  if (request.system) {
    args.push("--system-prompt", request.system);
  }

  return args;
}

export function buildClaudeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next.ANTHROPIC_API_KEY;
  delete next.ANTHROPIC_AUTH_TOKEN;
  return next;
}

export function parseClaudeStreamJson(output: string): BackendCompleteResult {
  const resultTexts: string[] = [];
  const assistantTexts: string[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    let parsed: StreamJsonLine;
    try {
      parsed = JSON.parse(line) as StreamJsonLine;
    } catch {
      continue;
    }

    if (parsed.type === "result" && typeof parsed.result === "string") {
      resultTexts.push(parsed.result);
    }

    if (parsed.type === "assistant" && Array.isArray(parsed.message?.content)) {
      for (const block of parsed.message.content) {
        if (block.type === "text" && typeof block.text === "string") {
          assistantTexts.push(block.text);
        }
      }
    }
  }

  const text = resultTexts.length > 0 ? resultTexts.join("") : assistantTexts.join("");
  return { text };
}
