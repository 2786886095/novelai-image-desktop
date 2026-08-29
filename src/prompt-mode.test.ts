import { describe, expect, it } from "vitest";
import {
  CONVERT_SYSTEM_PROMPTS,
  REVERSE_SYSTEM_PROMPTS,
  SCOPED_REVERSE_SYSTEM_PROMPTS,
} from "./data/prompt-templates";
import {
  buildConvertUserText,
  buildModeRepairUserText,
  buildPromptRuleRepairUserText,
  cleanPromptOutput,
  isLikelyTagListPrompt,
  isLikelyNaturalLanguagePrompt,
  knownCharacterRuntimeInstruction,
  modeNeedsRepair,
  modeUserInstruction,
  modeRepairSystemPrompt,
  promptRuleRepairSystemPrompt,
  promptRuleViolations,
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
    expect(result).toContain("简洁英文自然语言提示词");
  });

  it("does not let a legacy tag template override reverse natural mode", () => {
    const result = resolveModePrompt(
      "natural",
      { tags: "", natural: "", mixed: "" },
      "legacy reverse tag template",
      REVERSE_SYSTEM_PROMPTS,
    );
    expect(result).toBe(REVERSE_SYSTEM_PROMPTS.natural);
    expect(result).toContain("简洁英文自然语言提示词");
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
    expect(text).toContain("not a comma-separated tag list");
    expect(text).toContain("base scene | A boy/girl");
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
    expect(instruction).toContain("不要使用角色名");
    expect(instruction).toContain("最少必要");
  });

  it("requires both known-character variants to keep full template detail", () => {
    const instruction = knownCharacterRuntimeInstruction("tags", "convert", true);
    expect(instruction).toContain("namePrompt 和 featurePrompt");
    expect(instruction).toContain("同一完整画面");
    expect(instruction).not.toContain("Keep both prompts short");
    expect(instruction).not.toContain("Only add outfit, feature, pose, action");
  });

  it("adds mature-tag priority only to tags and mixed runtime rules", () => {
    expect(modeUserInstruction("tags", "convert")).toContain("exact mature");
    expect(modeUserInstruction("mixed", "reverse")).toContain("mature tags first");
    expect(modeUserInstruction("natural", "convert")).not.toContain("mature tags first");
    expect(CONVERT_SYSTEM_PROMPTS.natural).not.toContain("成熟整词优先");
  });

  it("detects duplicate, conflicting and decomposed mature tags", () => {
    const issues = promptRuleViolations(
      "tags",
      "1girl, cowboy shot, upper body, smile, smile",
      ["cowboy_shot"],
    );
    expect(issues.some((issue) => issue.includes("重复 Tag：smile"))).toBe(true);
    expect(issues.some((issue) => issue.includes("cowboy shot / upper body"))).toBe(true);
    expect(issues.some((issue) => issue.includes("成熟 Tag cowboy shot"))).toBe(true);
  });

  it("keeps natural mode outside mature-tag validation and builds focused repair", () => {
    expect(
      promptRuleViolations("natural", "A girl is standing.", ["standing"]),
    ).toEqual([]);
    expect(promptRuleRepairSystemPrompt("tags", false)).toContain(
      "只修复明确列出的违规项",
    );
    expect(
      buildPromptRuleRepairUserText({
        mode: "tags",
        originalInput: "七分身女孩",
        draft: "1girl, cowboy shot, upper body",
        violations: ["互斥 Tag"],
        matureTags: ["cowboy_shot"],
      }),
    ).toContain("cowboy_shot");
  });
});

describe("concise NovelAI V5 production templates", () => {
  const six = [
    ...Object.values(SCOPED_REVERSE_SYSTEM_PROMPTS),
    ...Object.values(CONVERT_SYSTEM_PROMPTS),
  ];

  it("keeps all six V5 templates bounded and free of obsolete workflow commands", () => {
    expect(six).toHaveLength(6);
    for (const template of six) {
      expect(template).toContain("NovelAI V5");
      expect(template.length).toBeGreaterThan(1_000);
      expect(template.length).toBeLessThan(2_500);
      expect(template).not.toContain("优先使用 mcp 服务搜索");
      expect(template).not.toContain("不要默认全部无权重");
      expect(template).not.toContain("图片分析顺序");
    }
  });

  it("preserves official dataset, text and multi-character boundaries", () => {
    for (const template of six) {
      expect(template).toContain("fur dataset");
      expect(template).toContain("background dataset");
      expect(template).toContain("Text:");
      expect(template).toContain("最多 22");
      expect(template).toContain("transparent background");
    }
    expect(SCOPED_REVERSE_SYSTEM_PROMPTS.mixed).toContain(
      "角色残差紧跟被限定的 Tag 或动作",
    );
    expect(CONVERT_SYSTEM_PROMPTS.mixed).toContain("自然语言不是必填");
  });

  it("locks in the audited V5 output-quality safeguards", () => {
    for (const template of [
      SCOPED_REVERSE_SYSTEM_PROMPTS.tags,
      SCOPED_REVERSE_SYSTEM_PROMPTS.mixed,
      CONVERT_SYSTEM_PROMPTS.tags,
      CONVERT_SYSTEM_PROMPTS.mixed,
    ]) {
      expect(template).toContain("不得留下孤立锚点");
      expect(template).toContain("1.2::tag ::");
      expect(template).toContain("source#giving/target#giving");
      expect(template).not.toContain("source#handing item");
      expect(template).toContain("交接中的道具不算共享道具");
      expect(template).toContain("属于关键互动");
    }
    for (const template of [
      SCOPED_REVERSE_SYSTEM_PROMPTS.natural,
      CONVERT_SYSTEM_PROMPTS.natural,
    ]) {
      expect(template).toContain("text, <language> text");
      expect(template).toContain("不复述文字内容");
      expect(template).not.toContain("reads OPEN");
    }
    for (const template of six) {
      expect(template).not.toContain("base 最末、第一个 | 之前");
      expect(template).not.toContain("不写 portrait、landscape");
      expect(template).toContain("同一层级互斥");
      expect(template).toContain("不视为互斥");
    }
    expect(SCOPED_REVERSE_SYSTEM_PROMPTS.tags).toContain(
      "本模式允许省略且不得混入自然语言",
    );
    expect(CONVERT_SYSTEM_PROMPTS.tags).toContain(
      "空间关系优先由角色段顺序表达",
    );
    expect(SCOPED_REVERSE_SYSTEM_PROMPTS.natural).not.toContain(
      "人数 Tag/人数描述",
    );
    expect(CONVERT_SYSTEM_PROMPTS.natural).not.toContain(
      "人数 Tag/人数描述",
    );
    expect(CONVERT_SYSTEM_PROMPTS.tags).toContain("mutual#holding hands");
    expect(CONVERT_SYSTEM_PROMPTS.mixed).toContain("mutual#holding hands");
    expect(SCOPED_REVERSE_SYSTEM_PROMPTS.mixed).toContain(
      "无成熟 Tag 的关键可见状态或表情",
    );
    expect(CONVERT_SYSTEM_PROMPTS.mixed).toContain(
      "无成熟 Tag 的关键可见状态或表情",
    );
    for (const template of Object.values(CONVERT_SYSTEM_PROMPTS)) {
      expect(template).toContain("-1::");
      expect(template).toContain("Text:");
    }
  });
});
