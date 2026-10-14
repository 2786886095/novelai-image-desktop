import ig5 from "../../shared/ig5-image-prompts.json";
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

export type ImageSystemPromptTask = 'convert' | 'reverse';
export const DEFAULT_IMAGE_TASK_PROMPT_PRESET_ID = "builtin-ig5-convert";
export const DEFAULT_REVERSE_IMAGE_TASK_PROMPT_PRESET_ID = "builtin-ig5-reverse";
export const LEGACY_IMAGE_TASK_PROMPT_PRESET_ID = "builtin-lyra-beta-3-8-image-task";
export function createDefaultImageTaskPromptPreset(task: ImageSystemPromptTask = 'convert'): ImageTaskPromptPreset {
  return {id: task === 'reverse' ? DEFAULT_REVERSE_IMAGE_TASK_PROMPT_PRESET_ID : DEFAULT_IMAGE_TASK_PROMPT_PRESET_ID,
    name: task === 'reverse' ? '无限五代 · 图片反推适配' : '无限五代 · 提示词转换适配',
    systemPrompt: ig5.prompts[task], jailbreakPrompt: '', source: 'builtin',
    sourceName: ig5.source + '@' + ig5.commit, sourceHash: ig5.promptSha256[task],
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z'};
}
export function createDefaultImageTaskPromptPresets(): ImageTaskPromptPreset[] {
  return [createDefaultImageTaskPromptPreset('convert'),createDefaultImageTaskPromptPreset('reverse'),createLegacyImageTaskPromptPreset()];
}
export function createLegacyImageTaskPromptPreset(): ImageTaskPromptPreset {
  const timestamp = "2026-09-06T00:00:00.000Z";
  return {
    id: LEGACY_IMAGE_TASK_PROMPT_PRESET_ID,
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
  if (!Array.isArray(value)) return createDefaultImageTaskPromptPresets();
  const ids = new Set<string>();
  const preserved: ImageTaskPromptPreset[] = value.flatMap((raw) => {
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
  // Keep an intentionally empty library empty, and never replace a saved custom body.
  if (value.length) for (const task of ['convert','reverse'] as const) {
    const preset = createDefaultImageTaskPromptPreset(task);
    if (!ids.has(preset.id)) preserved.push(preset);
  }
  return preserved;
}

/** Valid explicitly saved choices (including legacy ones) survive migration. */
export function imageTaskPresetIds(settings: {reverseConvertPromptPresetId?:unknown;convertSystemPromptPresetId?:unknown;reverseSystemPromptPresetId?:unknown}, presets: ImageTaskPromptPreset[]) {
  const valid = (id:unknown) => typeof id === 'string' && presets.some(p=>p.id===id) ? id : undefined;
  const choose = (task:ImageSystemPromptTask, id:unknown) => valid(id) ?? valid(settings.reverseConvertPromptPresetId) ?? valid(createDefaultImageTaskPromptPreset(task).id) ?? '';
  return {convertSystemPromptPresetId:choose('convert',settings.convertSystemPromptPresetId),reverseSystemPromptPresetId:choose('reverse',settings.reverseSystemPromptPresetId)};
}

export function selectedImageTaskPromptPreset(
  presets: ImageTaskPromptPreset[] | undefined,
  selectedId: string | undefined,
  task: ImageSystemPromptTask = 'convert',
): ImageTaskPromptPreset | null {
  const available = presets ?? createDefaultImageTaskPromptPresets();
  return available.find((item) => item.id === selectedId) ?? available.find(item=>item.id===createDefaultImageTaskPromptPreset(task).id) ?? available[0] ?? null;
}
