import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { AutomationTask, QueuedAutomationTask } from "./types.js";
import { rejectPathTraversal } from "./security.js";

export class FileTaskQueue {
  constructor(private readonly queueDir: string) {}

  async enqueue(task: AutomationTask): Promise<string> {
    await mkdir(this.queueDir, { recursive: true });
    const id = safeTaskId(task.id ?? `task_${randomUUID()}`);
    const queued: QueuedAutomationTask = {
      id,
      task: { ...task, id }
    };
    await writeFile(this.taskPath(id), `${JSON.stringify(queued, null, 2)}\n`, "utf8");
    return id;
  }

  async read(id: string): Promise<AutomationTask> {
    const queued = JSON.parse(await readFile(this.taskPath(safeTaskId(id)), "utf8")) as QueuedAutomationTask;
    return queued.task;
  }

  async dequeue(): Promise<QueuedAutomationTask | undefined> {
    await mkdir(this.queueDir, { recursive: true });
    const files = (await readdir(this.queueDir))
      .filter((file) => file.endsWith(".json") && !file.endsWith(".active.json"))
      .sort();
    const file = files[0];
    if (!file) {
      return undefined;
    }

    const activePath = join(this.queueDir, file.replace(/\.json$/, ".active.json"));
    await rename(join(this.queueDir, file), activePath);
    return JSON.parse(await readFile(activePath, "utf8")) as QueuedAutomationTask;
  }

  async complete(id: string): Promise<void> {
    await rm(join(this.queueDir, `${safeTaskId(id)}.active.json`), { force: true });
  }

  private taskPath(id: string): string {
    return join(this.queueDir, `${id}.json`);
  }
}

function safeTaskId(id: string): string {
  const safe = rejectPathTraversal(id);
  if (safe.includes("/") || safe.includes("\\")) {
    throw new Error(`task id cannot contain path separators: ${id}`);
  }

  return safe;
}
