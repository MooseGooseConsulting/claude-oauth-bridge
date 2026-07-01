import type { AutomationTask, RunnerFramework } from "./types.js";

interface RouteOptions {
  framework?: RunnerFramework;
  allowForkPullRequests?: boolean;
}

export function routeGitHubWebhook(
  event: string,
  payload: Record<string, unknown>,
  options: RouteOptions = {}
): AutomationTask {
  const framework = options.framework ?? "mastra";

  if (event === "pull_request") {
    const action = stringField(payload.action, "action");
    if (!["opened", "synchronize", "reopened", "ready_for_review"].includes(action)) {
      throw new Error(`unsupported pull_request action: ${action}`);
    }

    const repository = objectField(payload.repository, "repository");
    const pullRequest = objectField(payload.pull_request, "pull_request");
    const head = objectField(pullRequest.head, "pull_request.head");
    const headRepo = objectField(head.repo, "pull_request.head.repo");
    const base = objectField(pullRequest.base, "pull_request.base");
    const baseRepo = objectField(base.repo, "pull_request.base.repo");
    const repoFullName = stringField(repository.full_name, "repository.full_name");
    const headRepoFullName = stringField(headRepo.full_name, "pull_request.head.repo.full_name");
    const baseRepoFullName = stringField(baseRepo.full_name, "pull_request.base.repo.full_name");

    if (!options.allowForkPullRequests && (headRepo.fork === true || headRepoFullName !== baseRepoFullName)) {
      throw new Error("untrusted fork pull request rejected");
    }

    return {
      kind: "review-pr",
      framework,
      repoFullName,
      cloneUrl: stringField(repository.clone_url, "repository.clone_url"),
      defaultBranch: optionalString(repository.default_branch),
      prNumber: numberField(pullRequest.number, "pull_request.number"),
      prHeadRef: optionalString(head.ref),
      prHeadSha: optionalString(head.sha),
      prBaseRef: optionalString(base.ref)
    };
  }

  if (event === "issues") {
    const action = stringField(payload.action, "action");
    if (!["opened", "reopened", "labeled"].includes(action)) {
      throw new Error(`unsupported issues action: ${action}`);
    }
    const repository = objectField(payload.repository, "repository");
    const issue = objectField(payload.issue, "issue");
    const label = isObject(payload.label) ? optionalString(payload.label.name) : undefined;
    const kind = action === "labeled" && label === "agent:fix" ? "fix-issue" : "research-and-patch";

    return {
      kind,
      framework,
      repoFullName: stringField(repository.full_name, "repository.full_name"),
      cloneUrl: stringField(repository.clone_url, "repository.clone_url"),
      defaultBranch: optionalString(repository.default_branch),
      issueNumber: numberField(issue.number, "issue.number"),
      instructions: optionalString(issue.title)
    };
  }

  throw new Error(`unsupported GitHub webhook event: ${event}`);
}

function objectField(value: unknown, name: string): Record<string, unknown> {
  if (isObject(value)) {
    return value;
  }

  throw new Error(`${name} is required`);
}

function stringField(value: unknown, name = "field"): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  throw new Error(`${name} is required`);
}

function numberField(value: unknown, name: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  throw new Error(`${name} must be a positive integer`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
