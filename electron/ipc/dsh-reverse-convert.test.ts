import { describe, expect, it } from "vitest";
import {
  LYRA_IMAGE_TASK_PROVENANCE,
  DSH_IMAGE_AI_PROVENANCE,
  buildDshImageAiSystemAddon,
  injectDshImageAiSystemPrompt,
} from "./dsh-reverse-convert";
import { LYRA_PRESET_SYSTEM_PROMPT } from "../../src/tavern/lyra-preset-data";
import { createDefaultImageTaskPromptPreset } from "../../src/tavern/image-task-preset";

describe("built-in DSH image AI adapter", () => {
  it("injects the real built-in provenance and preserves the existing schema", () => {
    const value = injectDshImageAiSystemPrompt({ task: "reverse", systemPrompt: "RETURN_JSON" });
    expect(value).toContain("IG5 task-scoped rule adapter");
    expect(value).toContain("Inspect the supplied image directly");
    expect(value).toContain("RETURN_JSON");
    expect(DSH_IMAGE_AI_PROVENANCE.sourceCommit).toBe("eeff0bbeb905bdc57952dc7497d5fdfc33653c0f");
    expect(DSH_IMAGE_AI_PROVENANCE.sourceRulesSha256).toBe("cc3f06240a3ad92ccc1d5c35f1c1e6be81238e2b5c11eb94d3e72d1786e895a4");
  });

  it("supports strict conversion mode", () => {
    expect(buildDshImageAiSystemAddon("convert", "strict"))
      .toContain("silently check that no explicit visual constraint was dropped");
  });

  it("leaves the prompt byte-for-byte unchanged when disabled", () => {
    expect(injectDshImageAiSystemPrompt({ task: "convert", systemPrompt: "BASE", enabled: false }))
      .toBe("BASE");
  });

  it("does not expose a normal-chat task", () => {
    expect(buildDshImageAiSystemAddon("reverse")).not.toContain("ordinary chat");
  });

  it("uses scoped IG5 defaults while retaining Lyra attribution for saved choices", () => {
    for (const task of ["reverse", "convert"] as const) {
      const value = buildDshImageAiSystemAddon(task);
      expect(value).toContain("IG5 task-scoped rule adapter");
      expect(value).not.toContain(LYRA_PRESET_SYSTEM_PROMPT);
      expect(value.length).toBeGreaterThan(2000);
    }
    expect(LYRA_IMAGE_TASK_PROVENANCE.sourceSha256)
      .toBe("09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9");
  });

  it("does not duplicate the shared preset when the caller already assembled it", () => {
    const preset = createDefaultImageTaskPromptPreset("convert").systemPrompt;
    const value = injectDshImageAiSystemPrompt({ task: "convert", systemPrompt: preset });
    expect(value.split(preset)).toHaveLength(2);
    expect(value).toContain("Convert the supplied description directly");
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
      expect(value).toContain("Selected system preset · Custom preset");
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
    expect(value).not.toContain("Selected system preset");
    expect(value).not.toContain(LYRA_PRESET_SYSTEM_PROMPT);
  });
});
