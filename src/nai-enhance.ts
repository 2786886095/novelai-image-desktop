// NovelAI Enhance Magnitude presets. Ordinary img2img uses its own controls.
export const NAI_ENHANCE_PRESETS = [
  { strength: 0.2, noise: 0 },
  { strength: 0.4, noise: 0 },
  { strength: 0.5, noise: 0 },
  { strength: 0.6, noise: 0 },
  { strength: 0.7, noise: 0.1 },
] as const;

export function naiEnhancePreset(level: unknown) {
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > NAI_ENHANCE_PRESETS.length) {
    throw new RangeError("Enhance magnitude must be an integer from 1 to 5");
  }
  return NAI_ENHANCE_PRESETS[level - 1];
}
