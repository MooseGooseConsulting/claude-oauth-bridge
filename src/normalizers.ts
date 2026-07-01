import { HttpError } from "./errors.js";
import { resolveModel, type BackendModel, type PublicModelId, type ReasoningEffort } from "./models.js";

export interface InternalCompletionRequest {
  model: PublicModelId;
  backendModel: BackendModel;
  effort: ReasoningEffort;
  system?: string;
  prompt: string;
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
  role: string;
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
  rejectSystemMessages(request.messages);
  const model = normalizeModel(request.model);

  return {
    ...model,
    system: contentToText(request.system),
    prompt: messagesToPrompt(request.messages ?? []),
    stream: false
  };
}

export function normalizeChatCompletionRequest(
  request: ChatCompletionRequest
): InternalCompletionRequest {
  rejectTools(request.tools);
  rejectStreaming(request.stream);
  const model = normalizeModel(request.model);
  const messages = request.messages ?? [];
  const system = messages
    .filter((message) => validatedRole(message.role) === "system")
    .map((message) => contentToText(message.content))
    .filter((text): text is string => text !== undefined)
    .join("\n\n");

  return {
    ...model,
    system: system.length > 0 ? system : undefined,
    prompt: messagesToPrompt(messages.filter((message) => message.role !== "system")),
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

function rejectSystemMessages(messages: RoleMessage[] | undefined): void {
  if (messages?.some((message) => message.role === "system")) {
    throw new HttpError(
      400,
      "system_message_not_supported",
      "Use the top-level system field for Anthropic-style messages requests"
    );
  }
}

function messagesToPrompt(messages: RoleMessage[]): string {
  const normalized = messages.map((message) => ({
    role: validatedRole(message.role),
    text: contentToText(message.content) ?? ""
  }));
  if (normalized.length === 1 && normalized[0]?.role === "user") {
    return normalized[0].text;
  }

  return normalized
    .map((message) => `${roleLabel(message.role)}: ${message.text}`)
    .join("\n\n");
}

function validatedRole(role: string): Role {
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }

  throw new HttpError(400, "role_not_supported", `Unsupported message role: ${role}`);
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
