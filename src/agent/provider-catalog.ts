import type {
  AgentDiscoveredModel,
  AgentProviderProtocol,
} from "./types";

export type AgentProviderPresetId =
  | "deepseek"
  | "openai"
  | "anthropic"
  | "gemini"
  | "openrouter"
  | "siliconflow"
  | "dashscope"
  | "volcengine"
  | "moonshot"
  | "zhipu"
  | "groq"
  | "mistral"
  | "xai"
  | "ollama"
  | "lm-studio"
  | "custom";

export interface AgentProviderPreset {
  id: AgentProviderPresetId;
  label: string;
  protocol: AgentProviderProtocol;
  baseUrl: string;
  model: string;
  providerName: string;
  contextWindow: number;
  maxOutputTokens: number;
  vision: boolean;
  local?: boolean;
}

export const DEEPSEEK_CONTEXT_WINDOW = 1_048_576;
export const DEEPSEEK_DEFAULT_OUTPUT = 32_768;

/**
 * Presets are conveniences only. The free-form fields stay editable so a
 * compatible private gateway or future model never requires an app update.
 */
export const AGENT_PROVIDER_PRESETS: readonly AgentProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-responses",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    providerName: "DeepSeek",
    contextWindow: DEEPSEEK_CONTEXT_WINDOW,
    maxOutputTokens: DEEPSEEK_DEFAULT_OUTPUT,
    vision: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-terra",
    providerName: "OpenAI",
    contextWindow: 1_050_000,
    maxOutputTokens: 32_768,
    vision: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    protocol: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-5",
    providerName: "Anthropic",
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    vision: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "google-gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.7-flash",
    providerName: "Google Gemini",
    contextWindow: 1_048_576,
    maxOutputTokens: 32_768,
    vision: true,
  },
  { id: "openrouter", label: "OpenRouter", protocol: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "", providerName: "OpenRouter", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "siliconflow", label: "SiliconFlow", protocol: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1", model: "", providerName: "SiliconFlow", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "dashscope", label: "阿里云百炼 DashScope", protocol: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "", providerName: "DashScope", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "volcengine", label: "火山方舟 Ark", protocol: "openai-compatible", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "", providerName: "Volcengine Ark", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "moonshot", label: "Moonshot / Kimi", protocol: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", model: "", providerName: "Moonshot", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "zhipu", label: "智谱 BigModel", protocol: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "", providerName: "智谱 BigModel", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "groq", label: "Groq", protocol: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", model: "", providerName: "Groq", contextWindow: 128_000, maxOutputTokens: 8_192, vision: false },
  { id: "mistral", label: "Mistral AI", protocol: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", model: "", providerName: "Mistral AI", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "xai", label: "xAI", protocol: "openai-compatible", baseUrl: "https://api.x.ai/v1", model: "", providerName: "xAI", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
  { id: "ollama", label: "Ollama（本机）", protocol: "openai-compatible", baseUrl: "http://127.0.0.1:11434/v1", model: "", providerName: "Ollama", contextWindow: 32_768, maxOutputTokens: 4_096, vision: false, local: true },
  { id: "lm-studio", label: "LM Studio（本机）", protocol: "openai-compatible", baseUrl: "http://127.0.0.1:1234/v1", model: "", providerName: "LM Studio", contextWindow: 32_768, maxOutputTokens: 4_096, vision: false, local: true },
  { id: "custom", label: "自定义服务", protocol: "openai-compatible", baseUrl: "", model: "", providerName: "自定义模型", contextWindow: 128_000, maxOutputTokens: 8_192, vision: true },
] as const;

export const DEFAULT_AGENT_PROVIDER_PRESET = AGENT_PROVIDER_PRESETS[0];

export function normalizeAgentProviderProtocol(value: unknown): AgentProviderProtocol {
  if (value === "openai-responses" || value === "anthropic-messages" || value === "google-gemini") return value;
  return "openai-compatible";
}

export function findAgentProviderPreset(id: string | undefined) {
  return AGENT_PROVIDER_PRESETS.find((item) => item.id === id);
}

export function inferAgentProviderPreset(
  protocol: AgentProviderProtocol,
  baseUrl: string,
): AgentProviderPresetId {
  const normalized = normalizeAgentApiBaseUrl(baseUrl).toLocaleLowerCase();
  return AGENT_PROVIDER_PRESETS.find((item) =>
    item.id !== "custom"
    && item.protocol === protocol
    && normalizeAgentApiBaseUrl(item.baseUrl).toLocaleLowerCase() === normalized
  )?.id ?? "custom";
}

export function normalizeAgentApiBaseUrl(value: string) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

/** Join a provider base URL without producing /v1/v1/... for common inputs. */
export function agentApiUrl(baseUrl: string, route: string) {
  const base = normalizeAgentApiBaseUrl(baseUrl);
  const normalizedRoute = `/${String(route ?? "").replace(/^\/+/, "")}`;
  if (!base) return normalizedRoute;
  if (base.toLocaleLowerCase().endsWith(normalizedRoute.toLocaleLowerCase())) return base;
  if (/\/v\d+(?:beta)?$/i.test(base) && /^\/v\d+(?:beta)?\//i.test(normalizedRoute)) {
    return `${base}${normalizedRoute.replace(/^\/v\d+(?:beta)?/i, "")}`;
  }
  return `${base}${normalizedRoute}`;
}

export function isLocalAgentEndpoint(baseUrl: string) {
  try {
    const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
    return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export function agentProviderRequiresApiKey(protocol: AgentProviderProtocol, baseUrl: string) {
  if (protocol === "openai-compatible" && isLocalAgentEndpoint(baseUrl)) return false;
  return true;
}

export function agentProviderRuntimeAdapter(protocol: AgentProviderProtocol) {
  switch (protocol) {
    case "openai-responses": return { providerId: "openai", npm: "@ai-sdk/openai" } as const;
    case "anthropic-messages": return { providerId: "anthropic", npm: "@ai-sdk/anthropic" } as const;
    case "google-gemini": return { providerId: "google", npm: "@ai-sdk/google" } as const;
    default: return { providerId: "langbai-user", npm: "@ai-sdk/openai-compatible" } as const;
  }
}

export function recommendedAgentOutputTokens(maximum?: number) {
  if (!maximum || !Number.isFinite(maximum)) return 8_192;
  return Math.max(512, Math.min(32_768, Math.trunc(maximum)));
}

export function resolveAgentModelLimits(
  model: AgentDiscoveredModel,
  fallback?: Pick<AgentProviderPreset, "contextWindow" | "maxOutputTokens">,
) {
  const known = knownAgentModel(model.id);
  const contextWindow = model.contextWindow
    ?? known?.contextWindow
    ?? fallback?.contextWindow
    ?? 128_000;
  const supportedOutput = model.maxOutputTokens ?? known?.maxOutputTokens;
  const maxOutputTokens = model.suggestedOutputTokens
    ?? known?.suggestedOutputTokens
    ?? (supportedOutput ? recommendedAgentOutputTokens(supportedOutput) : undefined)
    ?? fallback?.maxOutputTokens
    ?? 8_192;
  return { contextWindow, maxOutputTokens };
}

type KnownModel = Omit<AgentDiscoveredModel, "id" | "displayName" | "metadataSource"> & { displayName?: string };

const KNOWN_MODELS: Record<string, KnownModel> = {
  "deepseek-v4-flash": { contextWindow: 1_048_576, maxOutputTokens: 393_216, suggestedOutputTokens: 32_768, reasoning: true, vision: false, displayName: "DeepSeek V4 Flash" },
  "deepseek-v4-pro": { contextWindow: 1_048_576, maxOutputTokens: 393_216, suggestedOutputTokens: 32_768, reasoning: true, vision: false, displayName: "DeepSeek V4 Pro" },
  "deepseek-v4-flash-vision-exp": { contextWindow: 1_048_576, maxOutputTokens: 393_216, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "DeepSeek V4 Flash Vision Exp" },
  "gpt-5.6-sol": { contextWindow: 1_050_000, maxOutputTokens: 131_072, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "GPT-5.6 Sol" },
  "gpt-5.6-terra": { contextWindow: 1_050_000, maxOutputTokens: 131_072, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "GPT-5.6 Terra" },
  "gpt-5.6-luna": { contextWindow: 1_050_000, maxOutputTokens: 131_072, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "GPT-5.6 Luna" },
  "claude-sonnet-5": { contextWindow: 1_000_000, maxOutputTokens: 131_072, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "Claude Sonnet 5" },
  "claude-opus-5": { contextWindow: 1_000_000, maxOutputTokens: 131_072, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "Claude Opus 5" },
  "gemini-3.7-flash": { contextWindow: 1_048_576, maxOutputTokens: 65_536, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "Gemini 3.7 Flash" },
  "gemini-3.6-flash": { contextWindow: 1_048_576, maxOutputTokens: 65_536, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "Gemini 3.6 Flash" },
  "gemini-3.5-flash": { contextWindow: 1_048_576, maxOutputTokens: 65_536, suggestedOutputTokens: 32_768, reasoning: true, vision: true, displayName: "Gemini 3.5 Flash" },
};

function finitePositive(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function knownAgentModel(modelId: string): AgentDiscoveredModel | undefined {
  const id = modelId.replace(/^models\//, "").trim();
  const exact = KNOWN_MODELS[id.toLocaleLowerCase()];
  const inferred = exact
    ?? (/^claude-(?:sonnet|opus)-5(?:$|-)/i.test(id) ? KNOWN_MODELS["claude-sonnet-5"] : undefined)
    ?? (/^gpt-5\.6(?:$|-)/i.test(id) ? KNOWN_MODELS["gpt-5.6-terra"] : undefined)
    ?? (/^gemini-3\.(?:5|6|7)-flash/i.test(id) ? KNOWN_MODELS["gemini-3.7-flash"] : undefined);
  if (!inferred) return undefined;
  return {
    id,
    displayName: inferred.displayName ?? id,
    ...inferred,
    metadataSource: "catalog",
  };
}

/** Normalize the different model-list schemas used by major providers. */
export function normalizeAgentDiscoveredModel(rawValue: unknown): AgentDiscoveredModel | undefined {
  const raw = typeof rawValue === "string" ? { id: rawValue } : record(rawValue);
  const rawName = raw.id ?? raw.name ?? raw.baseModelId;
  if (typeof rawName !== "string" || !rawName.trim()) return undefined;
  const id = rawName.replace(/^models\//, "").trim();
  const known = knownAgentModel(id);
  const architecture = record(raw.architecture);
  const topProvider = record(raw.top_provider);
  const contextWindow = finitePositive(
    raw.context_window,
    raw.context_length,
    raw.max_input_tokens,
    raw.inputTokenLimit,
    raw.max_model_len,
    raw.token_limit,
    topProvider.context_length,
  ) ?? known?.contextWindow;
  const maxOutputTokens = finitePositive(
    raw.max_output_tokens,
    raw.outputTokenLimit,
    raw.max_tokens,
    topProvider.max_completion_tokens,
  ) ?? known?.maxOutputTokens;
  const modalities = Array.isArray(architecture.input_modalities)
    ? architecture.input_modalities.map(String)
    : [];
  const explicitVision = typeof raw.vision === "boolean"
    ? raw.vision
    : modalities.length ? modalities.some((item) => item === "image" || item === "file") : undefined;
  const displayName = typeof raw.display_name === "string"
    ? raw.display_name
    : typeof raw.displayName === "string"
      ? raw.displayName
      : known?.displayName ?? id;
  return {
    id,
    displayName,
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxOutputTokens ? { maxOutputTokens, suggestedOutputTokens: known?.suggestedOutputTokens ?? recommendedAgentOutputTokens(maxOutputTokens) } : {}),
    ...(explicitVision !== undefined || known?.vision !== undefined ? { vision: explicitVision ?? known?.vision } : {}),
    ...(typeof raw.thinking === "boolean" || known?.reasoning !== undefined ? { reasoning: typeof raw.thinking === "boolean" ? raw.thinking : known?.reasoning } : {}),
    metadataSource: contextWindow || maxOutputTokens
      ? (finitePositive(raw.context_window, raw.context_length, raw.max_input_tokens, raw.inputTokenLimit, raw.max_model_len, raw.token_limit, topProvider.context_length, raw.max_output_tokens, raw.outputTokenLimit, raw.max_tokens, topProvider.max_completion_tokens) ? "api" : "catalog")
      : "unknown",
  };
}

export function isLikelyAgentModel(rawValue: unknown, model: AgentDiscoveredModel) {
  const raw = record(rawValue);
  const methods = Array.isArray(raw.supportedGenerationMethods) ? raw.supportedGenerationMethods.map(String) : [];
  if (methods.length && !methods.some((item) => /generateContent/i.test(item))) return false;
  return !/(?:embedding|embed-|moderation|rerank|whisper|transcri|tts|speech|realtime|image(?:-|_)generation|dall-e|veo|video)/i.test(model.id);
}
