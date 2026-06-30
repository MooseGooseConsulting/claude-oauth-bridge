import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { HttpError } from "./errors.js";

export interface ReviewJobRequest {
  workspace: string;
  repoFullName: string;
  prNumber: number;
  instructions?: string;
}

export interface FixJobRequest {
  workspace: string;
  repoFullName: string;
  issueNumber: number;
  instructions?: string;
}

export interface ParsedJobResult {
  summary: string;
  rawText?: string;
  [key: string]: unknown;
}

export function buildReviewPrompt(request: ReviewJobRequest): string {
  return [
    `Review repository ${request.repoFullName} at workspace ${request.workspace}.`,
    `Focus on PR #${request.prNumber}.`,
    request.instructions ? `Additional instructions: ${request.instructions}` : undefined,
    "Return JSON only with summary, findings, and changedFiles when relevant."
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n\n");
}

export function buildFixPrompt(request: FixJobRequest): string {
  return [
    `Fix issue #${request.issueNumber} in repository ${request.repoFullName}.`,
    `Use workspace ${request.workspace}.`,
    request.instructions ? `Additional instructions: ${request.instructions}` : undefined,
    "Return JSON only with summary, changedFiles, and any remaining concerns."
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n\n");
}

export function parseJobResult(text: string): ParsedJobResult {
  const trimmed = text.trim();

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (isObject(parsed) && typeof parsed.summary === "string") {
      return parsed as ParsedJobResult;
    }
  } catch {
    // Fall through to the raw-text response.
  }

  return {
    summary: text,
    rawText: text
  };
}

export async function validateWorkspace(
  workspace: string,
  allowedRoots: string[] = [process.cwd()]
): Promise<string> {
  const resolved = resolve(workspace);

  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new HttpError(400, "workspace_not_found", `Workspace is not a directory: ${workspace}`);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "workspace_not_found", `Workspace not found: ${workspace}`);
  }

  const realWorkspace = await realpath(resolved);
  const allowed = await Promise.all(allowedRoots.map(canonicalizeAllowedRoot));

  if (!allowed.some((root) => isPathInside(realWorkspace, root))) {
    throw new HttpError(403, "workspace_not_allowed", `Workspace is not under an allowed root: ${workspace}`);
  }

  return realWorkspace;
}

async function canonicalizeAllowedRoot(root: string): Promise<string> {
  const resolved = resolve(root);
  try {
    return await realpath(resolved);
  } catch {
    return resolved;
  }
}

function isPathInside(candidate: string, root: string): boolean {
  const diff = relative(root, candidate);
  return diff === "" || (diff.length > 0 && !diff.startsWith("..") && !isAbsolute(diff));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
