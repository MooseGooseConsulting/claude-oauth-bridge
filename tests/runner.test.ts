import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileTaskQueue } from "../src/runner/queue.js";
import {
  buildJobPlan,
  buildRunnerFrameworkConfig,
  runMockAutomationJob
} from "../src/runner/worker.js";
import {
  isSafeShellCommand,
  rejectPathTraversal,
  verifyGitHubSignature
} from "../src/runner/security.js";
import { routeGitHubWebhook } from "../src/runner/webhook.js";

describe("repo automation runner", () => {
  it("verifies GitHub webhook HMAC SHA-256 signatures", () => {
    const body = Buffer.from(JSON.stringify({ action: "opened" }));
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

    expect(verifyGitHubSignature(body, signature, "secret")).toBe(true);
    expect(verifyGitHubSignature(body, "sha256=bad", "secret")).toBe(false);
  });

  it("routes trusted pull_request events to review-pr tasks", () => {
    const task = routeGitHubWebhook("pull_request", {
      action: "opened",
      repository: {
        full_name: "owner/repo",
        clone_url: "https://github.com/owner/repo.git",
        default_branch: "main"
      },
      pull_request: {
        number: 12,
        head: {
          repo: { full_name: "owner/repo", fork: false },
          ref: "feature",
          sha: "abc123"
        },
        base: { repo: { full_name: "owner/repo" }, ref: "main" }
      }
    });

    expect(task).toMatchObject({
      kind: "review-pr",
      framework: "mastra",
      repoFullName: "owner/repo",
      prNumber: 12
    });
  });

  it("rejects untrusted fork pull requests by default", () => {
    expect(() =>
      routeGitHubWebhook("pull_request", {
        action: "opened",
        repository: { full_name: "owner/repo", clone_url: "https://github.com/owner/repo.git" },
        pull_request: {
          number: 12,
          head: { repo: { full_name: "attacker/repo", fork: true }, ref: "feature" },
          base: { repo: { full_name: "owner/repo" }, ref: "main" }
        }
      })
    ).toThrow(/untrusted fork/);
  });

  it("routes labeled issues to fix-issue tasks", () => {
    const task = routeGitHubWebhook("issues", {
      action: "labeled",
      label: { name: "agent:fix" },
      repository: {
        full_name: "owner/repo",
        clone_url: "https://github.com/owner/repo.git",
        default_branch: "main"
      },
      issue: { number: 44, title: "Fix parser" }
    });

    expect(task).toMatchObject({ kind: "fix-issue", issueNumber: 44 });
  });

  it("rejects unsupported issue actions", () => {
    expect(() =>
      routeGitHubWebhook("issues", {
        action: "closed",
        repository: {
          full_name: "owner/repo",
          clone_url: "https://github.com/owner/repo.git"
        },
        issue: { number: 44, title: "Done" }
      })
    ).toThrow(/unsupported issues action/);
  });

  it("persists queued tasks durably on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-runner-queue-"));
    try {
      const queue = new FileTaskQueue(dir);
      const task = routeGitHubWebhook("issues", {
        action: "opened",
        repository: {
          full_name: "owner/repo",
          clone_url: "https://github.com/owner/repo.git",
          default_branch: "main"
        },
        issue: { number: 7, title: "Research this" }
      });

      const id = await queue.enqueue(task);
      await expect(queue.read(id)).resolves.toMatchObject({ kind: "research-and-patch" });
      await expect(queue.dequeue()).resolves.toMatchObject({ id, task: { issueNumber: 7 } });
      await expect(queue.dequeue()).resolves.toBeUndefined();
      await queue.complete(id);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe task ids before using them as queue filenames", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-runner-queue-"));
    try {
      const queue = new FileTaskQueue(dir);
      await expect(
        queue.enqueue({
          id: "../outside",
          kind: "research-and-patch",
          framework: "mastra",
          repoFullName: "owner/repo",
          cloneUrl: "https://github.com/owner/repo.git"
        })
      ).rejects.toThrow(/path traversal/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prevents workspace path traversal", () => {
    expect(() => rejectPathTraversal("../outside")).toThrow(/path traversal/);
    expect(() => rejectPathTraversal("/absolute")).toThrow(/path traversal/);
    expect(rejectPathTraversal("owner-repo/task-1")).toBe("owner-repo/task-1");
  });

  it("allows only safe discovery and publishing shell commands", () => {
    expect(isSafeShellCommand(["git", "status"])).toBe(true);
    expect(isSafeShellCommand(["gh", "pr", "view", "12"])).toBe(true);
    expect(isSafeShellCommand(["docker", "ps"])).toBe(false);
    expect(isSafeShellCommand(["kubectl", "get", "pods"])).toBe(false);
  });

  it("builds framework configs that point at the bridge without caller-owned secrets", () => {
    const config = buildRunnerFrameworkConfig("hermes", {
      bridgeUrl: "http://bridge:8080",
      bridgeApiKeyEnv: "CLAUDE_OAUTH_BRIDGE_API_KEY"
    });

    expect(JSON.stringify(config)).toContain("http://bridge:8080");
    expect(JSON.stringify(config)).not.toContain("secret");
  });

  it("builds a job plan with full-clone setup and safe discovery commands", () => {
    const plan = buildJobPlan({
      id: "task-1",
      kind: "fix-issue",
      framework: "letta",
      repoFullName: "owner/repo",
      cloneUrl: "https://github.com/owner/repo.git",
      defaultBranch: "main",
      issueNumber: 7,
      instructions: "Fix it"
    });

    expect(plan.checkout).toMatchObject({ mode: "branch", baseRef: "main" });
    expect(plan.discoveryCommands).toContainEqual(["git", "status", "--short"]);
    expect(plan.publishCommands).toContainEqual(["gh", "pr", "create", "--fill"]);
    expect(plan.publishCommands).toContainEqual(["gh", "issue", "comment", "7", "--body-file", "PR_BODY.md"]);
  });

  it("omits issue commands for research-and-patch tasks without an issue number", () => {
    const plan = buildJobPlan({
      id: "task-research",
      kind: "research-and-patch",
      framework: "mastra",
      repoFullName: "owner/repo",
      cloneUrl: "https://github.com/owner/repo.git"
    });

    expect(plan.discoveryCommands).not.toContainEqual(["gh", "issue", "view", ""]);
    expect(plan.publishCommands).not.toContainEqual(["gh", "issue", "comment", ""]);
  });

  it("local mock run creates a branch and PR body artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-runner-work-"));
    try {
      const result = await runMockAutomationJob({
        workspaceRoot: dir,
        task: {
          id: "task-99",
          kind: "fix-issue",
          framework: "mastra",
          repoFullName: "owner/repo",
          cloneUrl: "https://github.com/owner/repo.git",
          defaultBranch: "main",
          issueNumber: 99
        }
      });

      expect(result.branchName).toBe("agent/fix-issue-99");
      const body = await readFile(result.prBodyPath, "utf8");
      expect(body).toContain("owner/repo");
      expect(body).toContain("fix-issue");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsafe task ids before using them as workspace path segments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bridge-runner-work-"));
    try {
      await expect(
        runMockAutomationJob({
          workspaceRoot: dir,
          task: {
            id: "../outside",
            kind: "research-and-patch",
            framework: "mastra",
            repoFullName: "owner/repo",
            cloneUrl: "https://github.com/owner/repo.git"
          }
        })
      ).rejects.toThrow(/path traversal/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
