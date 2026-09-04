import axios from "axios";
import type {
  AgentDiscoveredModel,
  AgentModelDiscoveryResult,
  AgentProviderProbe,
} from "../../src/agent/types";
import {
  agentApiUrl,
  agentProviderRequiresApiKey,
  isLikelyAgentModel,
  knownAgentModel,
  normalizeAgentDiscoveredModel,
} from "../../src/agent/provider-catalog";
import { proxyConfig } from "./proxy";

function failure(message: string): AgentModelDiscoveryResult {
  return { ok: false, message, models: [] };
}

function errorMessage(error: unknown) {
  const raw = error as {
    response?: { data?: { error?: { message?: string }; message?: string } };
    message?: string;
  };
  return raw.response?.data?.error?.message
    ?? raw.response?.data?.message
    ?? raw.message
    ?? "未知错误";
}

function mergeModelMetadata(model: AgentDiscoveredModel, currentModel?: string) {
  if (model.contextWindow || model.maxOutputTokens || model.id !== currentModel) return model;
  return knownAgentModel(model.id) ?? model;
}

export async function discoverAgentModels(
  probe: AgentProviderProbe,
): Promise<AgentModelDiscoveryResult> {
  const baseUrl = probe.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = probe.apiKey.trim();
  if (!baseUrl) return failure("请先填写 API 地址。");
  if (agentProviderRequiresApiKey(probe.protocol, baseUrl) && !apiKey) {
    return failure("该服务需要 API Key；本机 Ollama / LM Studio 可以留空。");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  let url: string;
  if (probe.protocol === "anthropic-messages") {
    url = agentApiUrl(baseUrl, "/v1/models");
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (probe.protocol === "google-gemini") {
    url = agentApiUrl(baseUrl, "/models");
    headers["x-goog-api-key"] = apiKey;
  } else {
    url = agentApiUrl(baseUrl, "/models");
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  }

  try {
    const response = await axios.get(url, {
      headers,
      timeout: 20_000,
      ...proxyConfig("ai"),
    });
    const data = response.data as Record<string, unknown> | unknown[];
    const values = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.data)
        ? (data as Record<string, unknown>).data as unknown[]
        : Array.isArray((data as Record<string, unknown>)?.models)
          ? (data as Record<string, unknown>).models as unknown[]
          : [];
    const byId = new Map<string, AgentDiscoveredModel>();
    for (const raw of values) {
      const normalized = normalizeAgentDiscoveredModel(raw);
      if (!normalized || !isLikelyAgentModel(raw, normalized)) continue;
      byId.set(normalized.id, mergeModelMetadata(normalized, probe.currentModel));
    }
    if (probe.currentModel && !byId.has(probe.currentModel)) {
      const known = knownAgentModel(probe.currentModel);
      if (known) byId.set(known.id, known);
    }
    const models = [...byId.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
    return {
      ok: true,
      message: models.length
        ? `检测到 ${models.length} 个可用于 Agent 的模型；上下文优先采用接口元数据，缺失时使用内置官方目录。`
        : "接口可用，但没有返回可用于对话的模型。",
      models,
    };
  } catch (error) {
    return failure(`模型检测失败：${errorMessage(error)}`);
  }
}
