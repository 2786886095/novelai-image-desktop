import { describe, expect, it } from "vitest";
import {
  defaultPositivePromptPresetName,
  positivePromptPresetStorageId,
  samePositivePromptPreset,
  uniquePositivePromptPresetName,
} from "./positive-prompt-presets";

describe("positive prompt presets", () => {
  it("derives a compact default name without changing Danbooru punctuation", () => {
    expect(defaultPositivePromptPresetName("  1girl, cinematic lighting, masterpiece  "))
      .toBe("1girl, cinematic lighting");
    expect(defaultPositivePromptPresetName("", 3)).toBe("正面提示词 3");
  });

  it("increments same-name presets while ignoring the edited item", () => {
    const presets = [
      { id: "a", name: "夜景" },
      { id: "b", name: "夜景 (1)" },
    ];
    expect(uniquePositivePromptPresetName(presets, "夜景")).toEqual({
      value: "夜景 (2)",
      renamed: true,
    });
    expect(uniquePositivePromptPresetName(presets, "夜景", "a")).toEqual({
      value: "夜景",
      renamed: false,
    });
  });

  it("uses exact name and prompt content for duplicate detection", () => {
    expect(samePositivePromptPreset(
      { name: "Preset", prompt: "1girl, blue hair" },
      { name: "Preset", prompt: "1girl, blue hair" },
    )).toBe(true);
    expect(samePositivePromptPreset(
      { name: "Preset", prompt: "1girl" },
      { name: "Preset", prompt: "1boy" },
    )).toBe(false);
    expect(positivePromptPresetStorageId("abc")).toBe("positive-prompt-abc");
  });
});
