import type { BackendModel, ReasoningEffort } from "../models.js";

export interface BackendCompleteRequest {
  model: BackendModel;
  effort: ReasoningEffort;
  prompt: string;
  system?: string;
  stream: boolean;
  cwd?: string;
  disableTools?: boolean;
}

export interface BackendCompleteResult {
  text: string;
  usage?: unknown;
}

export interface BridgeBackend {
  name: string;
  complete(request: BackendCompleteRequest): Promise<BackendCompleteResult>;
}
