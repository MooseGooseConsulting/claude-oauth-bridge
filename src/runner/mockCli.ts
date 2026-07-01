import { resolve } from "node:path";

import { runMockAutomationJob } from "./worker.js";
import type { AutomationTask, RunnerFramework } from "./types.js";

const args = parseArgs(process.argv.slice(2));
const kind = (args.kind ?? "fix-issue") as AutomationTask["kind"];
const issueNumber = Number(args.issue ?? "1");
const framework = (args.framework ?? "mastra") as RunnerFramework;

const task: AutomationTask = kind === "review-pr"
  ? {
      id: args.id ?? "local-mock",
      kind,
      framework,
      repoFullName: args.repo ?? "owner/repo",
      cloneUrl: args.cloneUrl ?? "https://github.com/owner/repo.git",
      defaultBranch: args.defaultBranch ?? "main",
      prNumber: Number(args.pr ?? "1")
    }
  : {
      id: args.id ?? "local-mock",
      kind,
      framework,
      repoFullName: args.repo ?? "owner/repo",
      cloneUrl: args.cloneUrl ?? "https://github.com/owner/repo.git",
      defaultBranch: args.defaultBranch ?? "main",
      issueNumber
    };

const result = await runMockAutomationJob({
  workspaceRoot: resolve(args.workspace ?? ".runner-workspaces"),
  task
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function parseArgs(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) {
      continue;
    }

    parsed[value.slice(2)] = values[index + 1] ?? "";
    index += 1;
  }

  return parsed;
}
