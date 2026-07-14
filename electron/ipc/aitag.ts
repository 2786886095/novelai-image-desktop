import axios from "axios";
import type { AitagSearchRequest } from "../../src/aitag";
import { AITAG_PAGE_SIZE } from "../../src/aitag";
import { proxyConfig } from "./proxy";

const API_BASE = "https://aitag.win";
const REQUEST_TIMEOUT = 30_000;
const MAX_SEARCH_LENGTH = 2_000;

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
  const response = await axios.get(`${API_BASE}/api/config`, requestConfig());
  return response.data as unknown;
}

export async function searchAitag(raw: unknown): Promise<unknown> {
  const request = normalizeAitagSearchRequest(raw);
  const endpoint = request.sort === "monthly"
    ? "/api/rank/monthly/real"
    : "/api/ai_works_search";
  const params: Record<string, string | number> = {
    page: request.page,
    page_size: AITAG_PAGE_SIZE,
  };
  if (request.query) params.q = request.query;
  if (request.prompt) params.prompt = request.prompt;
  if (request.sort === "new") {
    params.sort = "new";
    params.time_range = "all";
  }
  const response = await axios.get(`${API_BASE}${endpoint}`, {
    ...requestConfig(),
    params,
  });
  return response.data as unknown;
}

export async function getAitagWork(rawId: unknown): Promise<unknown> {
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid AITag work id");
  const response = await axios.get(`${API_BASE}/api/work/${id}`, requestConfig());
  return response.data as unknown;
}
