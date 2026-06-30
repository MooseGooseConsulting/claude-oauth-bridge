import { HttpError } from "./errors.js";
import { resolveModel, type BackendModel, type PublicModelId, type ReasoningEffort } from "./models.js";

export interface InternalCompletionRequest {
  model: PublicModelId;
  backendModel: BackendModel;
  effort: ReasoningEffort;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stream: boolean;
}

export interface BackendTextResult {
  text: string;
}

type Role = "user" | "assistant" | "system";
type TextBlock = { type: "text"; text: string };
type ContentBlock = TextBlock | Record<string, unknown>;
type MessageContent = string | ContentBlock[];

interface RoleMessage {
  role: Role;
  content: MessageContent;
}

interface MessagesRequest {
  model: string;
  system?: MessageContent;
  messages?: RoleMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
}

interface ChatCompletionRequest {
  model: string;
  messages?: RoleMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
}

export function normalizeMessagesRequest(request: MessagesRequest): InternalCompletionRequest {
  rejectTools(request.tools);
  rejectStreaming(request.stream);
  rejectUnsupportedGenerationControls(request.max_tokens, request.temperature);
  const model = normalizeModel(request.model);

  return {
    ...model,
    system: contentToText(request.system),
    prompt: messagesToPrompt(request.messages ?? []),
    maxTokens: request.max_tokens,
    temperature: request.temperature,
    stream: false
  };
}

export function normalizeChatCompletionRequest(
  request: ChatCompletionRequest
): InternalCompletionRequest {
  rejectTools(request.tools);
  rejectStreaming(request.stream);
  rejectUnsupportedGenerationControls(request.max_tokens, request.temperature);
  const model = normalizeModel(request.model);
  const messages = request.messages ?? [];
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => contentToText(message.content))
    .filter((text): text is string => text !== undefined)
    .join("\n\n");

  return {
    ...model,
    system: system.length > 0 ? system : undefined,
    prompt: messagesToPrompt(messages.filter((message) => message.role !== "system")),
    maxTokens: request.max_tokens,
    temperature: request.temperature,
    stream: false
  };
}

export function toMessagesResponse(id: string, model: PublicModelId, result: BackendTextResult) {
  return {
    id,
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: result.text }],
    stop_reason: "end_turn",
    stop_sequence: null
  };
}

export function toChatCompletionResponse(
  id: string,
  model: PublicModelId,
  result: BackendTextResult
) {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.text
        },
        finish_reason: "stop"
      }
    ]
  };
}

function normalizeModel(model: string): Pick<InternalCompletionRequest, "model" | "backendModel" | "effort"> {
  const mapping = resolveModel(model);
  if (mapping === undefined) {
    throw new HttpError(400, "model_not_supported", `Unsupported model: ${model}`);
  }

  return mapping;
}

function rejectTools(tools: unknown[] | undefined): void {
  if (Array.isArray(tools) && tools.length > 0) {
    throw new HttpError(400, "tool_use_not_supported", "Tool use is not supported by this bridge");
  }
}

function rejectStreaming(stream: boolean | undefined): void {
  if (stream === true) {
    throw new HttpError(400, "streaming_not_supported", "Streaming is not supported by this bridge");
  }
}

function rejectUnsupportedGenerationControls(maxTokens: number | undefined, temperature: number | undefined): void {
  if (maxTokens !== undefined || temperature !== undefined) {
    throw new HttpError(
      400,
      "generation_control_not_supported",
      "max_tokens and temperature are not supported by the claude-cli backend"
    );
  }
}

function messagesToPrompt(messages: RoleMessage[]): string {
  return messages
    .map((message) => `${roleLabel(message.role)}: ${contentToText(message.content) ?? ""}`)
    .join("\n\n");
}

function roleLabel(role: Role): string {
  return role === "assistant" ? "Assistant" : "User";
}

function contentToText(content: MessageContent | undefined): string | undefined {
  if (content === undefined) {
    return undefined;
  }

  if (typeof content === "string") {
    return content;
  }

  return content.map(contentBlockToText).join("");
}

function contentBlockToText(block: ContentBlock): string {
  if (block.type !== "text" || typeof block.text !== "string") {
    throw new HttpError(
      400,
      "content_block_not_supported",
      "Only text content blocks are supported by this bridge"
    );
  }

  return block.text;
}
