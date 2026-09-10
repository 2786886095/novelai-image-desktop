import axios from "axios";
import type { ArtistPoolSnapshot, ArtistPoolSyncProgress, ArtistTagRecord } from "../../src/artist-lab";
import { proxyConfig } from "./proxy";

type Progress = Omit<ArtistPoolSyncProgress, "requestId">;
export interface ArtistSyncOptions {
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
}
class SyncError extends Error {
  constructor(readonly issue: NonNullable<ArtistPoolSnapshot["issue"]>) { super(issue); }
}
function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new SyncError("cancelled"); }
async function pause(ms: number, signal?: AbortSignal) {
  checkCancelled(signal);
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(new SyncError("cancelled")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** Official cursor pagination: /tags.json?page=b<ID>, no numbered-page ceiling.
 * See https://danbooru.donmai.us/wiki_pages/help:api (pagination/rate limits).
 * Descending IDs avoid moving post-count ranks during traversal. Sort by count
 * only AFTER the terminal empty page. This is a scan, not an atomic DB snapshot.
 */
export async function syncAllArtistTags({ signal, onProgress }: ArtistSyncOptions = {}): Promise<ArtistPoolSnapshot> {
  const startedAt = Date.now();
  const records = new Map<number, ArtistTagRecord>();
  let cursor: number | null = null, pages = 0, lastRequestAt = 0;
  const notify = (state: Progress["state"] = "loading", retryAfterMs?: number) => onProgress?.({ loaded: records.size, pages, state, retryAfterMs });
  const fetchPage = async () => {
    for (let attempt = 0; ; attempt++) {
      // Long-running clients should stay near one read per second, per API docs.
      await pause(Math.max(0, 1000 - (Date.now() - lastRequestAt)), signal);
      checkCancelled(signal); lastRequestAt = Date.now();
      try {
        const response = await axios.get("https://danbooru.donmai.us/tags.json", {
          ...proxyConfig("update"), timeout: 30_000, signal,
          headers: { Accept: "application/json", "User-Agent": "Langbai-NovelAI-Studio/Artist-Pool-Sync" },
          params: { limit: 1000, page: cursor === null ? 1 : `b${cursor}`, "search[category]": 1,
            "search[is_deprecated]": "false", "search[order]": "date", only: "id,name,post_count,category,is_deprecated" },
        });
        if (!Array.isArray(response.data)) throw new SyncError("invalid-response");
        return response.data as unknown[];
      } catch (error) {
        checkCancelled(signal);
        const detail = error as { code?: string; response?: { status?: number; headers?: Record<string, string> } };
        const status = detail?.response?.status;
        const transient = status === 429 || (status != null && status >= 500) || ["ETIMEDOUT", "ECONNABORTED", "ECONNRESET"].includes(detail?.code ?? "");
        if (!transient || attempt >= 3) throw error;
        const retry = detail?.response?.headers?.["retry-after"];
        const serverDelay = retry == null ? 0 : Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(serverDelay) ? serverDelay : 0);
        // Don't ignore a server's long Retry-After, or hang indefinitely.
        if (delay > 120_000) throw error;
        notify("retrying", delay); await pause(delay, signal); notify();
      }
    }
  };
  try {
    notify();
    while (true) {
      const batch = await fetchPage(); checkCancelled(signal);
      if (batch.length === 0) {
        if (!records.size) throw new SyncError("empty-response");
        break;
      }
      let nextCursor: number = cursor ?? Number.MAX_SAFE_INTEGER;
      for (const raw of batch) {
        const row = raw as Record<string, unknown> | null;
        const id = row?.id, name = row?.name, count = row?.post_count;
        if (!Number.isSafeInteger(id) || Number(id) <= 0 || typeof name !== "string" || !name.trim()
          || row?.category !== 1 || row?.is_deprecated !== false || !Number.isSafeInteger(count) || Number(count) < 0) {
          throw new SyncError("invalid-response");
        }
        if ((cursor !== null && Number(id) >= cursor) || records.has(Number(id))) throw new SyncError("repeated-page");
        nextCursor = Math.min(nextCursor, Number(id));
        records.set(Number(id), { id: Number(id), name: name.trim(), postCount: Number(count), deprecated: false });
      }
      cursor = nextCursor; pages++; notify();
      // Even a short page is followed by a cursor request to verify exhaustion.
    }
    const items = [...records.values()].sort((a, b) => b.postCount - a.postCount || a.id - b.id);
    return { items, source: "network", requested: "all", rankedCount: items.length, issue: null, complete: true, startedAt, savedAt: Date.now(), pages };
  } catch (error) {
    const detail = error as { code?: string; response?: { status?: number } };
    const issue = signal?.aborted ? "cancelled" : error instanceof SyncError ? error.issue
      : ["ETIMEDOUT", "ECONNABORTED"].includes(detail?.code ?? "") ? "timeout" : "network";
    return { items: [], source: "empty", requested: "all", rankedCount: 0, issue, complete: false,
      startedAt, savedAt: null, pages, ...(Number.isInteger(detail?.response?.status) ? { httpStatus: detail.response!.status } : {}) };
  }
}

// Requests are keyed by renderer and request ID. Cancellation cannot stop a
// different window's sync. A second mount supersedes only its own old request.
export function createArtistPoolSyncManager() {
  const jobs = new Map<number, { id: string; controller: AbortController; result: Promise<ArtistPoolSnapshot> }>();
  return {
    start(owner: number, requestId: string, onProgress: (event: ArtistPoolSyncProgress) => void) {
      if (typeof requestId !== "string" || !requestId || requestId.length > 120) throw new Error("Invalid artist sync request ID");
      const old = jobs.get(owner);
      if (old?.id === requestId) return old.result;
      old?.controller.abort();
      const controller = new AbortController();
      const result = syncAllArtistTags({ signal: controller.signal, onProgress: p => onProgress({ ...p, requestId }) })
        .finally(() => { if (jobs.get(owner)?.id === requestId) jobs.delete(owner); });
      jobs.set(owner, { id: requestId, controller, result });
      return result;
    },
    cancel(owner: number, requestId: string) {
      const job = jobs.get(owner);
      if (job?.id !== requestId) return false;
      job.controller.abort(); return true;
    },
    dispose(owner: number) { jobs.get(owner)?.controller.abort(); },
  };
}
