export interface ConcurrencyLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const maxConcurrent = Math.max(1, Math.floor(limit));
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
