import { describe, expect, it } from "vitest";
import {
  LYRA_IMAGE_TASK_PROVENANCE,
  DSH_IMAGE_AI_PROVENANCE,
  buildDshImageAiSystemAddon,
  injectDshImageAiSystemPrompt,
} from "./dsh-reverse-convert";
import { LYRA_PRESET_SYSTEM_PROMPT } from "../../src/tavern/lyra-preset-data";

describe("built-in DSH image AI adapter", () => {
  it("injects the real built-in provenance and preserves the existing schema", () => {
    const value = injectDshImageAiSystemPrompt({ task: "reverse", systemPrompt: "RETURN_JSON" });
    expect(value).toContain("DSH Infinite Gen 3");
    expect(value).toContain("Inspect the supplied image directly");
    expect(value).toContain("RETURN_JSON");
    expect(DSH_IMAGE_AI_PROVENANCE.sourceCommit).toBe("d0c43196079849d4501afb3d1a8e195cf808024a");
    expect(DSH_IMAGE_AI_PROVENANCE.sourcePromptSha256).toBe("86385E839813D79C1AB6495B723BEA70BF36B0C55B359FDB18B78C4230C49244");
  });

  it("supports strict conversion mode", () => {
    expect(buildDshImageAiSystemAddon("convert", "strict"))
      .toContain("silently check that no explicit visual constraint was dropped");
  });

  it("supports only the built-in tavern image role through its dedicated task", () => {
    const value = buildDshImageAiSystemAddon("tavern-image");
    expect(value).toContain("NovelAI image proposal");
    expect(value).toContain("<langbai-image>");
  });

  it("leaves the prompt byte-for-byte unchanged when disabled", () => {
    expect(injectDshImageAiSystemPrompt({ task: "convert", systemPrompt: "BASE", enabled: false }))
      .toBe("BASE");
  });

  it("does not expose a normal-chat task", () => {
    expect(buildDshImageAiSystemAddon("reverse")).not.toContain("ordinary chat");
  });

  it("shares the supplied Lyra preset across all three image-task prompts", () => {
    for (const task of ["tavern-image", "reverse", "convert"] as const) {
      const value = buildDshImageAiSystemAddon(task);
      expect(value).toContain("Shared SillyTavern preset · 夏瑾 天琴座 Beta 3.8");
      expect(value.length).toBeGreaterThan(5000);
    }
    expect(LYRA_IMAGE_TASK_PROVENANCE.sourceSha256)
      .toBe("09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9");
  });

  it("does not duplicate the shared preset when Tavern already assembled it", () => {
    const value = injectDshImageAiSystemPrompt({ task: "tavern-image", systemPrompt: LYRA_PRESET_SYSTEM_PROMPT });
    expect(value.split(LYRA_PRESET_SYSTEM_PROMPT)).toHaveLength(2);
    expect(value).toContain("NovelAI image proposal");
  });

  it("uses the selected shared preset for reverse and conversion", () => {
    const sharedPreset = {
      id: "custom-preset",
      name: "Custom preset",
      systemPrompt: "CUSTOM_SYSTEM_PROMPT",
      jailbreakPrompt: "CUSTOM_JAILBREAK_PROMPT",
      source: "sillytavern-json" as const,
      createdAt: "2026-09-06T00:00:00.000Z",
      updatedAt: "2026-09-06T00:00:00.000Z",
    };
    for (const task of ["reverse", "convert"] as const) {
      const value = injectDshImageAiSystemPrompt({ task, systemPrompt: "BASE", sharedPreset });
      expect(value).toContain("Shared SillyTavern preset · Custom preset");
      expect(value).toContain("CUSTOM_SYSTEM_PROMPT");
      expect(value).toContain("CUSTOM_JAILBREAK_PROMPT");
      expect(value).not.toContain(LYRA_PRESET_SYSTEM_PROMPT);
    }
  });

  it("supports an explicitly empty shared-preset library", () => {
    const value = injectDshImageAiSystemPrompt({
      task: "convert",
      systemPrompt: "BASE",
      sharedPreset: null,
    });
    expect(value).toContain("BASE");
    expect(value).not.toContain("Shared SillyTavern preset");
    expect(value).not.toContain(LYRA_PRESET_SYSTEM_PROMPT);
  });
});
