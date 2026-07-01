import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { AutomationTask, QueuedAutomationTask } from "./types.js";

export class FileTaskQueue {
  constructor(private readonly queueDir: string) {}

  async enqueue(task: AutomationTask): Promise<string> {
    await mkdir(this.queueDir, { recursive: true });
    const id = task.id ?? `task_${randomUUID()}`;
    const queued: QueuedAutomationTask = {
      id,
      task: { ...task, id }
    };
    await writeFile(this.taskPath(id), `${JSON.stringify(queued, null, 2)}\n`, "utf8");
    return id;
  }

  async read(id: string): Promise<AutomationTask> {
    const queued = JSON.parse(await readFile(this.taskPath(id), "utf8")) as QueuedAutomationTask;
    return queued.task;
  }

  async dequeue(): Promise<QueuedAutomationTask | undefined> {
    await mkdir(this.queueDir, { recursive: true });
    const files = (await readdir(this.queueDir)).filter((file) => file.endsWith(".json")).sort();
    const file = files[0];
    if (!file) {
      return undefined;
    }

    const activePath = join(this.queueDir, file.replace(/\.json$/, ".active.json"));
    await rename(join(this.queueDir, file), activePath);
    return JSON.parse(await readFile(activePath, "utf8")) as QueuedAutomationTask;
  }

  private taskPath(id: string): string {
    return join(this.queueDir, `${id}.json`);
  }
}
