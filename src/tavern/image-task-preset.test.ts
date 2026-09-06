import { describe, expect, it } from "vitest";
import {
  createDefaultImageTaskPromptPreset,
  imageTaskPromptPresetFromSampler,
  normalizeImageTaskPromptPresets,
  selectedImageTaskPromptPreset,
} from "./image-task-preset";
import { createTavernSamplerPreset } from "./compat";

describe("reverse/convert shared prompt presets", () => {
  it("ships Lyra as the initial shared preset", () => {
    const preset = createDefaultImageTaskPromptPreset();
    expect(preset.name).toBe("夏瑾 天琴座 Beta 3.8");
    expect(preset.sourceHash).toBe("09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9");
    expect(preset.systemPrompt.length).toBeGreaterThan(3000);
  });

  it("maps an imported Tavern preset without losing either prompt layer", () => {
    const source = createTavernSamplerPreset("Imported");
    source.systemPrompt = "SYSTEM";
    source.jailbreakPrompt = "JAILBREAK";
    const preset = imageTaskPromptPresetFromSampler(source);
    expect(preset).toMatchObject({ name: "Imported", systemPrompt: "SYSTEM", jailbreakPrompt: "JAILBREAK" });
  });

  it("preserves an intentionally empty library and falls back to the first valid selection", () => {
    expect(normalizeImageTaskPromptPresets([])).toEqual([]);
    const presets = normalizeImageTaskPromptPresets([createDefaultImageTaskPromptPreset()]);
    expect(selectedImageTaskPromptPreset(presets, "missing")?.id).toBe(presets[0].id);
  });
});
