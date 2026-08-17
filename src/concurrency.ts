import { HttpError } from "./errors.js";

export interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(limit: number, maxQueueSize = 16): ConcurrencyLimiter {
  const maxConcurrent = Math.max(1, Math.floor(limit));
  const maxQueued = Math.max(0, Math.floor(maxQueueSize));
  let active = 0;
  const queue: Array<() => void> = [];

  async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }

    if (queue.length >= maxQueued) {
      throw new HttpError(503, "queue_full", "Bridge request queue is full");
    }

    return new Promise((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  }

  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next !== undefined) {
      next();
    }
  }

  return { run };
}
