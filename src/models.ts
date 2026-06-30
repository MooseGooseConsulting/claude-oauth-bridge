export const PUBLIC_MODEL_IDS = ["claude-oauth/sonnet", "claude-oauth/sonnet-high"] as const;

export type PublicModelId = (typeof PUBLIC_MODEL_IDS)[number];
export type BackendModel = "sonnet";
export type ReasoningEffort = "medium" | "high";

export interface ModelMapping {
  model: PublicModelId;
  backendModel: BackendModel;
  effort: ReasoningEffort;
}

const MODEL_MAPPINGS: Record<PublicModelId, Omit<ModelMapping, "model">> = {
  "claude-oauth/sonnet": {
    backendModel: "sonnet",
    effort: "medium"
  },
  "claude-oauth/sonnet-high": {
    backendModel: "sonnet",
    effort: "high"
  }
};

export function isPublicModelId(model: string): model is PublicModelId {
  return (PUBLIC_MODEL_IDS as readonly string[]).includes(model);
}

export function resolveModel(model: string): ModelMapping | undefined {
  if (!isPublicModelId(model)) {
    return undefined;
  }

  return {
    model,
    ...MODEL_MAPPINGS[model]
  };
}
