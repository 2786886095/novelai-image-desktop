import { describe, expect, it } from "vitest";
import { CONVERT_SYSTEM_PROMPTS, REVERSE_SYSTEM_PROMPTS } from "./data/prompt-templates";
import {
  buildConvertUserText,
  buildModeRepairUserText,
  cleanPromptOutput,
  isLikelyTagListPrompt,
  isLikelyNaturalLanguagePrompt,
  knownCharacterRuntimeInstruction,
  modeNeedsRepair,
  modeRepairSystemPrompt,
  naturalRepairSystemPrompt,
  parsePromptVariantResponse,
  resolveModePrompt,
} from "./prompt-mode";

describe("resolveModePrompt", () => {
  it("does not let a legacy tag template override convert natural mode", () => {
    const result = resolveModePrompt(
      "natural",
      { tags: "", natural: "", mixed: "" },
      "legacy danbooru tag template",
      CONVERT_SYSTEM_PROMPTS,
    );
    expect(result).toBe(CONVERT_SYSTEM_PROMPTS.natural);
    expect(result).toContain("不要使用 Danbooru tag 列表");
  });

  it("does not let a legacy tag template override reverse natural mode", () => {
    const result = resolveModePrompt(
      "natural",
      { tags: "", natural: "", mixed: "" },
      "legacy reverse tag template",
      REVERSE_SYSTEM_PROMPTS,
    );
    expect(result).toBe(REVERSE_SYSTEM_PROMPTS.natural);
    expect(result).toContain("100% 英文自然语言");
  });

  it("does not let a legacy template override tags mode either", () => {
    const result = resolveModePrompt("tags", { tags: "", natural: "", mixed: "" }, "legacy tags", CONVERT_SYSTEM_PROMPTS);
    expect(result).toBe(CONVERT_SYSTEM_PROMPTS.tags);
  });

  it("uses explicit per-mode overrides before defaults", () => {
    expect(
      resolveModePrompt("natural", { tags: "", natural: "custom natural", mixed: "" }, "legacy tags", CONVERT_SYSTEM_PROMPTS),
    ).toBe("custom natural");
  });
});

describe("prompt mode output handling", () => {
  it("detects the failed natural-mode tag-list shape", () => {
    expect(
      isLikelyTagListPrompt("2boys, black hair, white shirt, sitting, drawing, blue hair, blue hoodie, standing, throwing, ball"),
    ).toBe(true);
  });

  it("does not flag the expected natural multi-character prompt", () => {
    const prompt =
      "Two boys are in a classroom with desks, chairs, a sketchbook, and colored balls, shown from the front in a full-body view | A boy with short black hair and a white shirt is sitting on the left at the desk and drawing in the sketchbook with a pencil | A boy with blue hair and a dark blue hoodie is standing on the right and juggling three colored balls";
    expect(isLikelyTagListPrompt(prompt)).toBe(false);
    expect(isLikelyNaturalLanguagePrompt(prompt)).toBe(true);
  });

  it("cleans common model wrappers without changing prompt semantics", () => {
    expect(cleanPromptOutput("Output: \"Two boys are in a classroom\\n| A boy is drawing\"")).toBe(
      "Two boys are in a classroom | A boy is drawing",
    );
  });

  it("adds hard natural-language constraints to convert requests", () => {
    const text = buildConvertUserText("一个黑发男孩坐着画画", "natural");
    expect(text).toContain("User description:");
    expect(text).toContain("一个黑发男孩坐着画画");
    expect(text).toContain("Do not output a comma-separated Danbooru tag list.");
    expect(text).toContain("base scene description | A boy/girl");
  });

  it("builds a repair prompt anchored to the target example style", () => {
    expect(naturalRepairSystemPrompt()).toContain("Two boys are in a classroom");
    expect(buildModeRepairUserText("natural", "一个黑发男孩", "1boy, black hair, sitting")).toContain("Incorrect output:");
  });

  it("repairs tags mode when the model returns pure prose", () => {
    const prose = "Two boys are in a classroom while one boy is drawing and another boy is juggling balls.";
    expect(modeNeedsRepair("tags", prose)).toBe(true);
    expect(modeRepairSystemPrompt("tags")).toContain("comma-separated tags");
  });

  it("does not repair tags mode when the model returns tag-style output", () => {
    const tags =
      "2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front | boy, short black hair, white shirt, sitting, drawing | boy, blue hair, dark blue hoodie, standing, juggling balls";
    expect(modeNeedsRepair("tags", tags)).toBe(false);
  });

  it("repairs mixed mode when the model returns pure prose only", () => {
    const prose = "Two boys are in a classroom while one boy is drawing and another boy is juggling balls.";
    expect(modeNeedsRepair("mixed", prose)).toBe(true);
    expect(modeRepairSystemPrompt("mixed")).toContain("mostly Danbooru tags");
  });

  it("parses known-character JSON variants", () => {
    const parsed = parsePromptVariantResponse(
      JSON.stringify({
        namePrompt: "1girl, solo, furina (genshin impact), drinking tea",
        featurePrompt: "1girl, solo, white hair, blue eyes, blue outfit, drinking tea",
      }),
      true,
    );
    expect(parsed.primary).toBe("1girl, solo, furina (genshin impact), drinking tea");
    expect(parsed.variants?.featurePrompt).toContain("white hair");
  });

  it("parses labeled known-character variants", () => {
    const parsed = parsePromptVariantResponse(
      "角色名版：1girl, solo, furina (genshin impact)\n特征版：1girl, solo, white hair, blue eyes, blue outfit",
      true,
    );
    expect(parsed.variants?.namePrompt).toContain("furina (genshin impact)");
    expect(parsed.variants?.featurePrompt).not.toContain("furina");
  });

  it("adds concise no-name guidance when known character mode is off", () => {
    const instruction = knownCharacterRuntimeInstruction("tags", "convert", false);
    expect(instruction).toContain("已知网络/游戏/动漫角色模式已关闭");
    expect(instruction).toContain("不要依赖角色名字 tag");
    expect(instruction).toContain("保持提示词简洁");
  });

  it("requires both known-character variants to keep full template detail", () => {
    const instruction = knownCharacterRuntimeInstruction("tags", "convert", true);
    expect(instruction).toContain("namePrompt 和 featurePrompt");
    expect(instruction).toContain("furina (genshin impact)");
    expect(instruction).not.toContain("Keep both prompts short");
    expect(instruction).not.toContain("Only add outfit, feature, pose, action");
  });
});
