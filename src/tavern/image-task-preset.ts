import type { TavernSamplerPreset } from "../agent/types";
import {
  LYRA_PRESET_JAILBREAK_PROMPT,
  LYRA_PRESET_NAME,
  LYRA_PRESET_SOURCE_NAME,
  LYRA_PRESET_SOURCE_SHA256,
  LYRA_PRESET_SYSTEM_PROMPT,
} from "./lyra-preset-data";

export interface ImageTaskPromptPreset {
  id: string;
  name: string;
  systemPrompt: string;
  jailbreakPrompt: string;
  source?: "builtin" | "sillytavern-json" | "langbai";
  sourceName?: string;
  sourceHash?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_IMAGE_TASK_PROMPT_PRESET_ID = "builtin-lyra-beta-3-8-image-task";

export function createDefaultImageTaskPromptPreset(): ImageTaskPromptPreset {
  const timestamp = "2026-09-06T00:00:00.000Z";
  return {
    id: DEFAULT_IMAGE_TASK_PROMPT_PRESET_ID,
    name: LYRA_PRESET_NAME,
    systemPrompt: LYRA_PRESET_SYSTEM_PROMPT,
    jailbreakPrompt: LYRA_PRESET_JAILBREAK_PROMPT,
    source: "builtin",
    sourceName: LYRA_PRESET_SOURCE_NAME,
    sourceHash: LYRA_PRESET_SOURCE_SHA256,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function imageTaskPromptPresetFromSampler(preset: TavernSamplerPreset): ImageTaskPromptPreset {
  return {
    id: preset.id,
    name: preset.name,
    systemPrompt: preset.systemPrompt,
    jailbreakPrompt: preset.jailbreakPrompt,
    ...(preset.source ? { source: preset.source } : {}),
    ...(preset.sourceName ? { sourceName: preset.sourceName } : {}),
    ...(preset.sourceHash ? { sourceHash: preset.sourceHash } : {}),
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  };
}

export function normalizeImageTaskPromptPresets(value: unknown): ImageTaskPromptPreset[] {
  if (!Array.isArray(value)) return [createDefaultImageTaskPromptPreset()];
  const ids = new Set<string>();
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<ImageTaskPromptPreset>;
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 160) : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 160) : "";
    const systemPrompt = typeof item.systemPrompt === "string" ? item.systemPrompt.slice(0, 500_000) : "";
    const jailbreakPrompt = typeof item.jailbreakPrompt === "string" ? item.jailbreakPrompt.slice(0, 500_000) : "";
    if (!id || !name || (!systemPrompt.trim() && !jailbreakPrompt.trim()) || ids.has(id)) return [];
    ids.add(id);
    const timestamp = new Date(0).toISOString();
    return [{
      id,
      name,
      systemPrompt,
      jailbreakPrompt,
      ...(item.source === "builtin" || item.source === "sillytavern-json" || item.source === "langbai"
        ? { source: item.source }
        : {}),
      ...(typeof item.sourceName === "string" && item.sourceName.trim()
        ? { sourceName: item.sourceName.trim().slice(0, 260) }
        : {}),
      ...(typeof item.sourceHash === "string" && item.sourceHash.trim()
        ? { sourceHash: item.sourceHash.trim().slice(0, 128) }
        : {}),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : timestamp,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : timestamp,
    }];
  });
}

export function selectedImageTaskPromptPreset(
  presets: ImageTaskPromptPreset[] | undefined,
  selectedId: string | undefined,
): ImageTaskPromptPreset | null {
  const available = presets ?? [createDefaultImageTaskPromptPreset()];
  return available.find((item) => item.id === selectedId) ?? available[0] ?? null;
}
