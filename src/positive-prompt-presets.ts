import type { PositivePromptPreset } from "./types";

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
  left: Pick<PositivePromptPreset, "name" | "prompt">,
  right: Pick<PositivePromptPreset, "name" | "prompt">,
): boolean {
  return left.name.trim() === right.name.trim() && left.prompt === right.prompt;
}
