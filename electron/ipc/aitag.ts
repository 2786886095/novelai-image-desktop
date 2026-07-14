import axios from "axios";
import type { AitagSearchRequest } from "../../src/aitag";
import { AITAG_PAGE_SIZE, aitagImageUrl, normalizeAitagConfig, normalizeAitagDetail, normalizeAitagSearch } from "../../src/aitag";
import { proxyConfig } from "./proxy";
import { cacheAitagImage } from "./aitag-cache";

const API_BASE = "https://aitag.win";
const REQUEST_TIMEOUT = 30_000;
const MAX_SEARCH_LENGTH = 2_000;
const DATA_CACHE_TTL_MS = 10 * 60_000;
type CachedRequest = { expires: number; promise: Promise<unknown> };
let configCache: CachedRequest | null = null;
const searchCache = new Map<string, CachedRequest>();
const workCache = new Map<number, CachedRequest>();
let defaultSnapshot: { config: unknown; search: unknown } | null = null;
let defaultFreshInFlight: Promise<unknown> | null = null;

function cached(cache: CachedRequest | undefined | null, load: () => Promise<unknown>, save: (value: CachedRequest) => void) {
  if (cache && cache.expires > Date.now()) return cache.promise;
  const value: CachedRequest = { expires: Date.now() + DATA_CACHE_TTL_MS, promise: load() };
  save(value);
  value.promise.catch(() => save({ expires: 0, promise: Promise.resolve(undefined) }));
  return value.promise;
}

function safePage(value: unknown): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page <= 10_000 ? page : 1;
}

function safeSearch(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_SEARCH_LENGTH) : "";
}

export function normalizeAitagSearchRequest(value: unknown): Required<AitagSearchRequest> {
  const request = value && typeof value === "object"
    ? (value as AitagSearchRequest)
    : {};
  return {
    page: safePage(request.page),
    query: safeSearch(request.query),
    prompt: safeSearch(request.prompt),
    sort: request.sort === "monthly" ? "monthly" : "new",
    timeRange: /^(?:all|older|current|y\d{4}|q\d{4}Q[1-4]|m\d{4}-(?:0[1-9]|1[0-2]))$/.test(request.timeRange ?? "")
      ? request.timeRange!
      : request.sort === "monthly" ? "current" : "all",
  };
}

function requestConfig() {
  return {
    timeout: REQUEST_TIMEOUT,
    headers: {
      Accept: "application/json",
      "User-Agent": "Langbai-NovelAI-Studio/AITag-Data-Client",
    },
    ...proxyConfig("update"),
  };
}

export async function getAitagConfig(): Promise<unknown> {
  return cached(configCache, async () => {
    const response = await axios.get(`${API_BASE}/api/config`, requestConfig());
    return response.data as unknown;
  }, (value) => { configCache = value.expires ? value : null; });
}

export async function searchAitag(raw: unknown): Promise<unknown> {
  const request = normalizeAitagSearchRequest(raw);
  const cacheKey = JSON.stringify(request);
  return cached(searchCache.get(cacheKey), () => searchAitagNetwork(request), (value) => {
    if (value.expires) searchCache.set(cacheKey, value); else searchCache.delete(cacheKey);
  });
}

async function searchAitagNetwork(request: Required<AitagSearchRequest>): Promise<unknown> {
  const historicalRank = request.sort === "monthly" && request.timeRange !== "current";
  const endpoint = request.sort === "monthly"
    ? historicalRank ? "/api/rank/monthly/fixed" : "/api/rank/monthly/real"
    : "/api/ai_works_search";
  const params: Record<string, string | number> = {
    page: request.page,
    page_size: AITAG_PAGE_SIZE,
  };
  if (request.query) params.q = request.query;
  if (request.prompt) params.prompt = request.prompt;
  if (request.sort === "new") {
    params.sort = "new";
    params.time_range = request.timeRange;
  } else if (historicalRank) {
    params.month = request.timeRange === "older"
      ? "older"
      : request.timeRange.slice(1);
  }
  const response = await axios.get(`${API_BASE}${endpoint}`, {
    ...requestConfig(),
    params,
  });
  return response.data as unknown;
}

export async function searchAitagFresh(raw: unknown): Promise<unknown> {
  const request = normalizeAitagSearchRequest(raw);
  const isDefault = request.page === 1 && !request.query && !request.prompt && request.sort === "new" && request.timeRange === "all";
  if (isDefault && defaultFreshInFlight) return defaultFreshInFlight;
  const networkRequest = searchAitagNetwork(request);
  if (isDefault) defaultFreshInFlight = networkRequest;
  let value: unknown;
  try {
    value = await networkRequest;
  } finally {
    if (isDefault) defaultFreshInFlight = null;
  }
  const cacheKey = JSON.stringify(request);
  searchCache.set(cacheKey, { expires: Date.now() + DATA_CACHE_TTL_MS, promise: Promise.resolve(value) });
  if (isDefault) {
    const config = await getAitagConfig();
    defaultSnapshot = { config, search: value };
  }
  return value;
}

export function getAitagSnapshot() {
  return defaultSnapshot;
}

export async function getAitagWork(rawId: unknown): Promise<unknown> {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid AITag work id");
  return cached(workCache.get(id), async () => {
    const response = await axios.get(`${API_BASE}/api/work/${id}`, requestConfig());
    return response.data as unknown;
  }, (value) => {
    if (value.expires) workCache.set(id, value); else workCache.delete(id);
  });
}

export function clearAitagDataCache() {
  configCache = null;
  searchCache.clear();
  workCache.clear();
  defaultSnapshot = null;
}

export async function prewarmAitag(rawRetentionDays: unknown) {
  const [rawConfig, rawSearch] = await Promise.all([
    getAitagConfig(),
    searchAitagFresh({ page: 1, query: "", prompt: "", sort: "new", timeRange: "all" }),
  ]);
  defaultSnapshot = { config: rawConfig, search: rawSearch };
  const config = normalizeAitagConfig(rawConfig);
  const result = normalizeAitagSearch(rawSearch);
  const queue = result.items.slice(0, 12);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const work = queue[cursor++];
      try {
        const detail = normalizeAitagDetail(await getAitagWork(work.id));
        const first = detail.images[0];
        if (first) await cacheAitagImage(aitagImageUrl(config, first), rawRetentionDays);
      } catch {
        // Prewarming is best effort and must never affect the workbench.
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { works: result.items.length, images: Math.min(queue.length, 12) };
}
