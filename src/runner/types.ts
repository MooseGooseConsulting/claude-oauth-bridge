export type RunnerFramework = "mastra" | "hermes" | "letta";

export type AutomationTaskKind = "review-pr" | "fix-issue" | "research-and-patch";

interface BaseAutomationTask {
  id?: string;
  kind: AutomationTaskKind;
  framework: RunnerFramework;
  repoFullName: string;
  cloneUrl: string;
  defaultBranch?: string;
  instructions?: string;
}

export interface ReviewPrTask extends BaseAutomationTask {
  kind: "review-pr";
  prNumber: number;
  prHeadRef?: string;
  prHeadSha?: string;
  prBaseRef?: string;
}

export interface FixIssueTask extends BaseAutomationTask {
  kind: "fix-issue";
  issueNumber: number;
}

export interface ResearchAndPatchTask extends BaseAutomationTask {
  kind: "research-and-patch";
  issueNumber?: number;
}

export type AutomationTask = ReviewPrTask | FixIssueTask | ResearchAndPatchTask;

export interface QueuedAutomationTask {
  id: string;
  task: AutomationTask;
}
