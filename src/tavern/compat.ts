import type { TavernSamplerPreset } from "../agent/types";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => string(item).trim()).filter(Boolean)
    : [];
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function isoDate(value: unknown, fallback = tavernNow()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

export function tavernId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function tavernNow() {
  return new Date().toISOString();
}

export function createTavernSamplerPreset(name = "沉浸叙事"): TavernSamplerPreset {
  const timestamp = tavernNow();
  return {
    id: tavernId("sampler"),
    name,
    systemPrompt: "You are {{char}}. Stay in character, write vivid dialogue and actions, and never describe yourself as an AI or assistant.",
    jailbreakPrompt: "Continue the scene naturally. Respect established characterization, world facts, and the user's latest intent.",
    temperature: 0.9,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stop: [],
    source: "langbai",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeTavernSamplerPreset(value: unknown): TavernSamplerPreset {
  const raw = record(value);
  const timestamp = tavernNow();
  const fallback = createTavernSamplerPreset(string(raw.name, "沉浸叙事").trim() || "沉浸叙事");
  return {
    id: string(raw.id, fallback.id),
    name: string(raw.name, fallback.name).trim().slice(0, 160) || fallback.name,
    systemPrompt: string(raw.systemPrompt, fallback.systemPrompt).slice(0, 200_000),
    jailbreakPrompt: string(raw.jailbreakPrompt, fallback.jailbreakPrompt).slice(0, 100_000),
    temperature: finite(raw.temperature, fallback.temperature, 0, 2),
    topP: finite(raw.topP, fallback.topP, 0, 1),
    frequencyPenalty: finite(raw.frequencyPenalty, fallback.frequencyPenalty, -2, 2),
    presencePenalty: finite(raw.presencePenalty, fallback.presencePenalty, -2, 2),
    ...(Number.isFinite(Number(raw.maxOutputTokens))
      ? { maxOutputTokens: Math.round(finite(raw.maxOutputTokens, 4096, 128, 131_072)) }
      : {}),
    stop: stringArray(raw.stop).slice(0, 32),
    ...(raw.source === "builtin" || raw.source === "sillytavern-json" || raw.source === "langbai"
      ? { source: raw.source }
      : {}),
    ...(string(raw.sourceName).trim() ? { sourceName: string(raw.sourceName).trim().slice(0, 260) } : {}),
    ...(string(raw.sourceHash).trim() ? { sourceHash: string(raw.sourceHash).trim().slice(0, 128) } : {}),
    createdAt: isoDate(raw.createdAt, timestamp),
    updatedAt: isoDate(raw.updatedAt, timestamp),
  };
}
