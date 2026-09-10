type WaitingRequest = {
  background: boolean;
  signal?: AbortSignal;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  abort: () => void;
};

/** Shared by candidates, total queries and retries. Brief 2/s bursts, then 1/s;
 * at most two requests in flight. Metadata yields to a selected-pool refresh.
 */
export function createArtistRequestScheduler() {
  const waiting: WaitingRequest[] = [];
  let active = 0, foreground = 0, tokens = 6, updatedAt = performance.now();
  let lastStart = -Infinity, blockedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function pump() {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (active >= 2) return;
    let index = waiting.findIndex(entry => !entry.background);
    if (index < 0 && foreground === 0) index = 0;
    const entry = waiting[index];
    if (!entry) return;
    const now = performance.now();
    tokens = Math.min(6, tokens + Math.max(0, now - updatedAt) / 1000);
    updatedAt = now;
    const delay = Math.max(0, 500 - (now - lastStart), (1 - tokens) * 1000, blockedUntil - now);
    if (delay > 0) { timer = setTimeout(pump, Math.ceil(delay)); return; }
    waiting.splice(index, 1);
    entry.signal?.removeEventListener("abort", entry.abort);
    active++; tokens--; lastStart = now;
    let released = false;
    entry.resolve(() => { if (!released) { released = true; active--; pump(); } });
    pump();
  }

  return {
    acquire(signal?: AbortSignal, background = false): Promise<() => void> {
      if (signal?.aborted) return Promise.reject(new Error("Artist request cancelled"));
      return new Promise((resolve, reject) => {
        const entry: WaitingRequest = { signal, background, resolve, reject, abort: () => {
          const i = waiting.indexOf(entry);
          if (i >= 0) waiting.splice(i, 1);
          signal?.removeEventListener("abort", entry.abort);
          reject(new Error("Artist request cancelled")); pump();
        } };
        waiting.push(entry);
        signal?.addEventListener("abort", entry.abort, { once: true });
        pump();
      });
    },
    beginSelection() {
      foreground++; pump();
      let finished = false;
      return () => { if (!finished) { finished = true; foreground--; pump(); } };
    },
    backoff(milliseconds: number) {
      blockedUntil = Math.max(blockedUntil, performance.now() + milliseconds);
      tokens = 0; updatedAt = performance.now(); pump();
    },
  };
}

export const artistRequestScheduler = createArtistRequestScheduler();
