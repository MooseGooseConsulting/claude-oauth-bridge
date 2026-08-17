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
  logger?: (event: Record<string, unknown>) => void;
}

export function createBridgeServer({ backend, config, logger }: BridgeServerOptions): Server {
  const limiter = createConcurrencyLimiter(config.concurrency, config.maxQueueSize);

  return createServer((request, response) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    const url = new URL(request.url ?? "/", "http://localhost");

    void limiter.run(async () => {
      await handleRequest(request, response, backend, config, requestId);
    }).catch((error: unknown) => {
      writeError(response, error, requestId);
    }).finally(() => {
      try {
        logger?.({
          event: "request_completed",
          requestId,
          method: request.method ?? "UNKNOWN",
          path: url.pathname,
          status: response.statusCode,
          durationMs: Date.now() - startedAt
        });
      } catch {
        // Logging must not affect request handling.
      }
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  backend: BridgeBackend,
  config: BridgeConfig,
  requestId: string
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  try {
    authenticate(request, config, url.pathname);
  } catch (error) {
    closeAfterResponse(response);
    throw error;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      backend: config.backend,
      oauthConfigured: config.oauthConfigured
    }, requestId);
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/models") {
    writeJson(response, 200, {
      object: "list",
      data: PUBLIC_MODEL_IDS.map((id) => ({ id, object: "model" }))
    }, requestId);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/messages") {
    ensureOauth(config);
    ensureJsonContentType(request, response);
    const body = (await readJson(request, config.maxRequestBytes)) as unknown as Parameters<typeof normalizeMessagesRequest>[0];
    const normalized = normalizeMessagesRequest(body);
    const result = await backend.complete({
      model: normalized.backendModel,
      effort: normalized.effort,
      prompt: normalized.prompt,
      system: normalized.system,
      stream: normalized.stream,
      disableTools: true
    });

    writeJson(response, 200, toMessagesResponse(requestId, normalized.model, result), requestId);
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    ensureOauth(config);
    ensureJsonContentType(request, response);
    const body = (await readJson(request, config.maxRequestBytes)) as unknown as Parameters<
      typeof normalizeChatCompletionRequest
    >[0];
    const normalized = normalizeChatCompletionRequest(body);
    const result = await backend.complete({
      model: normalized.backendModel,
      effort: normalized.effort,
      prompt: normalized.prompt,
      system: normalized.system,
      stream: normalized.stream,
      disableTools: true
    });

    writeJson(response, 200, toChatCompletionResponse(requestId, normalized.model, result), requestId);
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/review") {
    ensureOauth(config);
    ensureJsonContentType(request, response);
    const body = await readJson(request, config.maxRequestBytes);
    const job = normalizeReviewJob(body);
    const workspace = await validateWorkspace(job.workspace, config.allowedWorkspaceRoots);
    const prompt = buildReviewPrompt({ ...job, workspace });
    const result = await backend.complete({
      cwd: workspace,
      model: "sonnet",
      effort: "high",
      prompt,
      stream: false
    });

    writeJson(response, 200, parseJobResult(result.text), requestId);
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs/fix") {
    ensureOauth(config);
    ensureJsonContentType(request, response);
    const body = await readJson(request, config.maxRequestBytes);
    const job = normalizeFixJob(body);
    const workspace = await validateWorkspace(job.workspace, config.allowedWorkspaceRoots);
    const prompt = buildFixPrompt({ ...job, workspace });
    const result = await backend.complete({
      cwd: workspace,
      model: "sonnet",
      effort: "high",
      prompt,
      stream: false
    });

    writeJson(response, 200, parseJobResult(result.text), requestId);
    return;
  }

  throw new HttpError(404, "not_found", `Route not found: ${request.method ?? "UNKNOWN"} ${url.pathname}`);
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      request.resume();
      throw new HttpError(413, "request_too_large", "Request body exceeds configured size limit");
    }
    chunks.push(buffer);
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
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
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

function authenticate(request: IncomingMessage, config: BridgeConfig, path: string): void {
  if (path === "/health" || config.bridgeApiKey === undefined) {
    return;
  }

  const authorization = request.headers.authorization;
  const apiKey = request.headers["x-bridge-api-key"];
  const bearer = `Bearer ${config.bridgeApiKey}`;
  if (headerHasValue(authorization, bearer) || headerHasValue(apiKey, config.bridgeApiKey)) {
    return;
  }

  throw new HttpError(401, "unauthorized", "Bridge API key is required");
}

function ensureOauth(config: BridgeConfig): void {
  if (!config.oauthConfigured) {
    throw new HttpError(503, "oauth_not_configured", "Claude OAuth is not configured");
  }
}

function ensureJsonContentType(request: IncomingMessage, response: ServerResponse): void {
  const contentType = request.headers["content-type"];
  const value = Array.isArray(contentType) ? contentType.join(",") : contentType;
  const mediaType = value?.toLowerCase().split(";")[0]?.trim();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    closeAfterResponse(response);
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json");
  }
}

function closeAfterResponse(response: ServerResponse): void {
  response.shouldKeepAlive = false;
  if (!response.headersSent) {
    response.setHeader("connection", "close");
  }
}

function writeError(response: ServerResponse, error: unknown, requestId: string): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (isHttpError(error)) {
    writeJson(response, error.status, error.toJSON(), requestId);
    return;
  }

  writeJson(response, 500, {
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  }, requestId);
}

function writeJson(response: ServerResponse, status: number, body: unknown, requestId: string): void {
  response.statusCode = status;
  response.writeHead(status, {
    "content-type": "application/json",
    "x-request-id": requestId
  });
  response.end(JSON.stringify(body));
}

function headerHasValue(value: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => headerHasValue(entry, expected));
  }

  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .includes(expected) ?? false;
}

function createRequestId(): string {
  return `req_${randomUUID()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
