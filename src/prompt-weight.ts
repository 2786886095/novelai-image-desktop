// Helpers for the per-tag weight editor. NovelAI accepts brace weighting where
// each surrounding {} multiplies a tag's strength by ~1.05 and each [] divides
// it by ~1.05. We model a tag as { core, level } where level is the signed
// number of braces (positive = {}, negative = []), and render the multiplier.

export interface WeightedTag {
  /** The bare tag text with all weight braces stripped. */
  core: string;
  /** Signed brace level: +n => n×"{}", -n => n×"[]", 0 => no weighting. */
  level: number;
  /** Raw original segment (used to preserve anything we don't understand). */
  raw: string;
}

const PER_BRACE = 1.05;

/** Split a prompt into comma-separated segments, keeping non-empty ones. */
export function splitPromptTags(prompt: string): string[] {
  return prompt
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse one segment into { core, level }. */
export function parseWeightedTag(raw: string): WeightedTag {
  let s = raw.trim();
  let level = 0;
  // Peel matching outer braces/brackets one layer at a time.
  for (;;) {
    if (s.length >= 2 && s.startsWith("{") && s.endsWith("}")) {
      s = s.slice(1, -1).trim();
      level += 1;
    } else if (s.length >= 2 && s.startsWith("[") && s.endsWith("]")) {
      s = s.slice(1, -1).trim();
      level -= 1;
    } else {
      break;
    }
  }
  return { core: s, level, raw: raw.trim() };
}

/** Render { core, level } back into a prompt segment. */
export function serializeWeightedTag(core: string, level: number): string {
  const c = core.trim();
  if (!c) return "";
  if (level > 0) return "{".repeat(level) + c + "}".repeat(level);
  if (level < 0) return "[".repeat(-level) + c + "]".repeat(-level);
  return c;
}

/** Approximate strength multiplier for a brace level (1.00, 1.05, 0.95, ...). */
export function weightMultiplier(level: number): number {
  return Math.pow(PER_BRACE, level);
}

/** Human-readable multiplier like "×1.16" / "×0.91" / "" for neutral. */
export function formatMultiplier(level: number): string {
  if (level === 0) return "";
  return `×${weightMultiplier(level).toFixed(2)}`;
}

/**
 * Rebuild a full prompt after changing one tag's level. `index` refers to the
 * position within splitPromptTags(prompt). Clamps level to [-5, 5].
 */
export function setTagLevelInPrompt(prompt: string, index: number, level: number): string {
  const segs = splitPromptTags(prompt);
  if (index < 0 || index >= segs.length) return prompt;
  const { core } = parseWeightedTag(segs[index]);
  const clamped = Math.max(-5, Math.min(5, level));
  segs[index] = serializeWeightedTag(core, clamped);
  return segs.join(", ");
}
