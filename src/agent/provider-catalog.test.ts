import { describe, expect, it } from "vitest";
import {
  agentApiUrl,
  agentProviderRequiresApiKey,
  agentProviderRuntimeAdapter,
  inferAgentProviderPreset,
  normalizeAgentDiscoveredModel,
  resolveAgentModelLimits,
} from "./provider-catalog";

describe("agent provider catalog", () => {
  it("recognizes DeepSeek and maps all native transports", () => {
    expect(inferAgentProviderPreset("openai-responses", "https://api.deepseek.com/")).toBe("deepseek");
    expect(agentProviderRuntimeAdapter("anthropic-messages").npm).toBe("@ai-sdk/anthropic");
    expect(agentProviderRuntimeAdapter("google-gemini").providerId).toBe("google");
  });

  it("does not duplicate version segments in model-list endpoints", () => {
    expect(agentApiUrl("https://api.anthropic.com/v1", "/v1/models")).toBe("https://api.anthropic.com/v1/models");
    expect(agentApiUrl("https://generativelanguage.googleapis.com/v1beta", "/models")).toBe("https://generativelanguage.googleapis.com/v1beta/models");
  });

  it("allows keyless local endpoints and reads provider metadata", () => {
    expect(agentProviderRequiresApiKey("openai-compatible", "http://127.0.0.1:11434/v1")).toBe(false);
    expect(agentProviderRequiresApiKey("openai-compatible", "https://openrouter.ai/api/v1")).toBe(true);
    expect(normalizeAgentDiscoveredModel({ name: "models/gemini-3.7-flash", inputTokenLimit: 1048576 })?.contextWindow).toBe(1_048_576);
  });

  it("matches context and output limits when a detected model is selected", () => {
    expect(resolveAgentModelLimits({
      id: "deepseek-v4-flash-vision-exp",
      displayName: "DeepSeek V4 Flash Vision Exp",
      metadataSource: "unknown",
    })).toEqual({ contextWindow: 1_048_576, maxOutputTokens: 32_768 });
    expect(resolveAgentModelLimits({
      id: "private-model",
      displayName: "Private model",
      contextWindow: 262_144,
      maxOutputTokens: 65_536,
      metadataSource: "api",
    })).toEqual({ contextWindow: 262_144, maxOutputTokens: 32_768 });
  });
});
