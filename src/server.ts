import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import type { BridgeBackend } from "./backend/types.js";
import type { BridgeConfig } from "./config.js";
import { createConcurrencyLimiter } from "./concurrency.js";
import { HttpError, isHttpError } from "./errors.js";
import {
  buildFixPrompt,
  buildReviewPrompt,
  parseJobResult,
  validateWorkspace,
  type FixJobRequest,
  type ReviewJobRequest
} from "./jobs.js";
import { PUBLIC_MODEL_IDS } from "./models.js";
import {
  normalizeChatCompletionRequest,
  normalizeMessagesRequest,
  toChatCompletionResponse,
  toMessagesResponse
} from "./normalizers.js";

export interface BridgeServerOptions {
  backend: BridgeBackend;
  config: BridgeConfig;
}

export function createBridgeServer({ backend, config }: BridgeServerOptions): Server {
  const limiter = createConcurrencyLimiter(config.concurrency);

  return createServer((request, response) => {
    void limiter.run(async () => {
      await handleRequest(request, response, backend, config);
    }).catch((error: unknown) => {
      writeError(response, error);
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  backend: BridgeBackend,
  config: BridgeConfig
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      backend: config.backend,
      oauthConfigured: config.oauthConfigured
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/models") {
    writeJson(response, 200, {
      object: "list",
      data: PUBLIC_MODEL_IDS.map((id) => ({ id, object: "model" }))
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/messages") {
    const body = (await readJson(request)) as unknown as Parameters<typeof normalizeMessagesRequest>[0];
    const normalized = normalizeMessagesRequest(body);
    const result = await backend.complete({
      model: normalized.backendModel,
      effort: normalized.effort,
      prompt: normalized.prompt,
      system: normalized.system,
      maxTokens: normalized.maxTokens,
      temperature: normalized.temperature,
      stream: normalized.stream
    });

    writeJson(response, 200, toMessagesResponse(createRequestId(), normalized.model, result));
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    const body = (await readJson(request)) as unknown as Parameters<
      typeof normalizeChatCompletionRequest
    >[0];
    const normalized = normalizeChatCompletionRequest(body);
    const result = await backend.complete({
      model: normalized.backendModel,
      effort: normalized.effort,
      prompt: normalized.prompt,
      system: normalized.system,
      maxTokens: normalized.maxTokens,
      temperature: normalized.temperature,
      stream: normalized.stream
    });

    writeJson(response, 200, toChatCompletionResponse(createRequestId(), normalized.model, result));
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/review") {
    const body = await readJson(request);
    const job = normalizeReviewJob(body);
    const workspace = await validateWorkspace(job.workspace);
    const prompt = buildReviewPrompt({ ...job, workspace });
    const result = await backend.complete({
      cwd: workspace,
      model: "sonnet",
      effort: "high",
      prompt,
      stream: false
    });

    writeJson(response, 200, parseJobResult(result.text));
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/fix") {
    const body = await readJson(request);
    const job = normalizeFixJob(body);
    const workspace = await validateWorkspace(job.workspace);
    const prompt = buildFixPrompt({ ...job, workspace });
    const result = await backend.complete({
      cwd: workspace,
      model: "sonnet",
      effort: "high",
      prompt,
      stream: false
    });

    writeJson(response, 200, parseJobResult(result.text));
    return;
  }

  throw new HttpError(404, "not_found", `Route not found: ${request.method ?? "UNKNOWN"} ${url.pathname}`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (isObject(parsed)) {
      return parsed;
    }
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }

  throw new HttpError(400, "invalid_json", "Request body must be a JSON object");
}

function normalizeReviewJob(body: Record<string, unknown>): ReviewJobRequest {
  return {
    workspace: requireString(body.workspace, "workspace"),
    repoFullName: requireString(body.repoFullName, "repoFullName"),
    prNumber: requireNumber(body.prNumber, "prNumber"),
    instructions: optionalString(body.instructions, "instructions")
  };
}

function normalizeFixJob(body: Record<string, unknown>): FixJobRequest {
  return {
    workspace: requireString(body.workspace, "workspace"),
    repoFullName: requireString(body.repoFullName, "repoFullName"),
    issueNumber: requireNumber(body.issueNumber, "issueNumber"),
    instructions: optionalString(body.instructions, "instructions")
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new HttpError(400, "invalid_request", `${field} is required`);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  throw new HttpError(400, "invalid_request", `${field} must be a string`);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new HttpError(400, "invalid_request", `${field} must be a positive integer`);
}

function writeError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (isHttpError(error)) {
    writeJson(response, error.status, error.toJSON());
    return;
  }

  writeJson(response, 500, {
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createRequestId(): string {
  return `req_${randomUUID()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
