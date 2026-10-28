import {normalizeCharacterPresets} from "./character-presets";
import { appendPromptText } from "./prompt-append";
import type { CharCaptionItem, PositivePromptPreset } from "./types";

export const POSITIVE_PROMPT_PRESET_IMAGE_LIMIT = 3;
const STORAGE_PREFIX = "positive-prompt-";

export function positivePromptPresetStorageId(id: string): string {
  return `${STORAGE_PREFIX}${String(id ?? "").trim()}`;
}

/** Use the first readable part of the prompt as the default display name.
 * This never changes the saved prompt itself. */
export function defaultPositivePromptPresetName(
  prompt: string,
  fallbackIndex = 1,
): string {
  const compact = String(prompt ?? "")
    .replace(/\s+/g, " ")
    .replace(/^,+|,+$/g, "")
    .trim();
  if (!compact) return `正面提示词 ${Math.max(1, Math.trunc(fallbackIndex) || 1)}`;
  const parts = compact.split(/[,，、;；]+/).map((part) => part.trim()).filter(Boolean);
  let candidate = parts[0] ?? compact;
  for (const part of parts.slice(1)) {
    if (`${candidate}, ${part}`.length > 28) break;
    candidate = `${candidate}, ${part}`;
  }
  if (candidate.length > 28) {
    candidate = candidate.slice(0, 28).replace(/\s+\S*$/, "").trim() || candidate.slice(0, 28);
  }
  candidate = candidate.trim().replace(/[,，、;；:\s]+$/g, "");
  return candidate || `正面提示词 ${Math.max(1, Math.trunc(fallbackIndex) || 1)}`;
}

export function uniquePositivePromptPresetName(
  presets: readonly Pick<PositivePromptPreset, "id" | "name">[],
  requested: string,
  excludeId = "",
): { value: string; renamed: boolean } {
  const base = String(requested ?? "").trim().slice(0, 120) || "正面提示词";
  const existing = new Set(
    presets
      .filter((preset) => preset.id !== excludeId)
      .map((preset) => preset.name.trim().toLocaleLowerCase()),
  );
  let value = base;
  let index = 1;
  while (existing.has(value.toLocaleLowerCase())) value = `${base} (${index++})`;
  return { value, renamed: value !== base };
}

export function samePositivePromptPreset(
  left: Pick<PositivePromptPreset, "name" | "prompt" | "captions">,
  right: Pick<PositivePromptPreset, "name" | "prompt" | "captions">,
): boolean {
  return left.name.trim() === right.name.trim() && left.prompt === right.prompt
    && JSON.stringify(left.captions ?? []) === JSON.stringify(right.captions ?? []);
}

export function mergeCharacterPresets(presets: PositivePromptPreset[], legacy: unknown): PositivePromptPreset[] {
  const next = [...presets];
  for (const item of normalizeCharacterPresets(legacy)) {
    let id = `character-${item.id}`;
    while (next.some(p => p.id === id)) id += '-imported';
    next.push({id, name: uniquePositivePromptPresetName(next, item.name).value,
      prompt: item.captions.map(c => c.prompt).join('\n'), captions: item.captions,
      createdAt: item.createdAt, previewImages: []});
  }
  return next;
}

export type PositivePresetApplyMode = "replace" | "append";

export type PositivePresetApplication =
  | { kind: "prompt"; prompt: string; appended: boolean }
  | { kind: "characters"; captions: CharCaptionItem[]; appended: boolean; row: boolean }
  | { kind: "over-capacity" };

/** Decide what applying a saved positive preset does. Plain presets replace the
 * prompt or are appended after it; character presets replace the characters or
 * are added after the existing ones; one saved character appended inside a
 * character row extends that row's own prompts instead of adding a character. */
export function resolvePositivePresetApplication(
  preset: Pick<PositivePromptPreset, "prompt" | "captions">,
  mode: PositivePresetApplyMode,
  context: {
    value: string;
    character?: CharCaptionItem;
    currentCaptions: readonly CharCaptionItem[];
    maxCharacters: number;
  },
): PositivePresetApplication {
  const append = mode === "append";
  const captions = preset.captions ?? [];
  if (append && context.character && captions.length === 1) {
    const saved = captions[0];
    return {
      kind: "characters",
      appended: true,
      row: true,
      captions: [{
        ...context.character,
        prompt: appendPromptText(context.value, saved.prompt),
        negativePrompt: appendPromptText(context.character.negativePrompt ?? "", saved.negativePrompt ?? ""),
      }],
    };
  }
  if (captions.length) {
    const next = append ? [...context.currentCaptions, ...captions] : captions;
    if (next.length > context.maxCharacters) return { kind: "over-capacity" };
    return { kind: "characters", appended: append, row: false, captions: next.map((caption) => ({ ...caption })) };
  }
  return { kind: "prompt", appended: append, prompt: append ? appendPromptText(context.value, preset.prompt) : preset.prompt };
}
