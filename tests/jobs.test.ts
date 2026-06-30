import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildFixPrompt, buildReviewPrompt, parseJobResult } from "../src/jobs.js";

describe("job prompt handling", () => {
  it("builds a review prompt for the requested repository and PR", () => {
    const prompt = buildReviewPrompt({
      workspace: "/workspace/repo",
      repoFullName: "owner/repo",
      prNumber: 123,
      instructions: "Find security issues."
    });

    expect(prompt).toContain("owner/repo");
    expect(prompt).toContain("PR #123");
    expect(prompt).toContain("Find security issues.");
    expect(prompt).toContain("Return JSON only");
  });

  it("builds a fix prompt for the requested repository and issue", () => {
    const prompt = buildFixPrompt({
      workspace: "/workspace/repo",
      repoFullName: "owner/repo",
      issueNumber: 456,
      instructions: "Fix the failing parser."
    });

    expect(prompt).toContain("owner/repo");
    expect(prompt).toContain("issue #456");
    expect(prompt).toContain("Fix the failing parser.");
    expect(prompt).toContain("changedFiles");
  });

  it("parses structured job JSON when Claude returns it", () => {
    const result = parseJobResult('{"summary":"ok","findings":[]}');

    expect(result).toEqual({ summary: "ok", findings: [] });
  });

  it("keeps raw text when structured parsing fails", () => {
    const result = parseJobResult("plain output");

    expect(result).toEqual({ summary: "plain output", rawText: "plain output" });
  });

  it("rejects non-existent workspaces for jobs", async () => {
    const { validateWorkspace } = await import("../src/jobs.js");

    await expect(validateWorkspace(join(tmpdir(), "missing-bridge-workspace"))).rejects.toThrow(
      /workspace_not_found/
    );
  });

  it("accepts existing workspace directories", async () => {
    const { validateWorkspace } = await import("../src/jobs.js");
    const dir = await mkdtemp(join(tmpdir(), "bridge-workspace-"));

    try {
      await expect(validateWorkspace(dir)).resolves.toBe(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
