import { describe, expect, it } from "vitest";
import { buildTuiwenLocalPrompt, isTuiwenPromptRefusal } from "./prompt-fallback";

describe("tuiwen local prompt fallback", () => {
  it("maps common Chinese scene cues into stable English NovelAI tags", () => {
    const prompt = buildTuiwenLocalPrompt({
      mode: "tags",
      globalStylePrompt: "cinematic anime style",
      globalCharacterSetting: "white hair, red eyes",
      referencePrompts: ["blue dress, gold earrings"],
    }, {
      cnPrompt: "白发少女在雨夜街道奔跑，回头看向镜头，全身远景。",
    });

    expect(prompt).toContain("1girl");
    expect(prompt).toContain("white hair");
    expect(prompt).toContain("rain");
    expect(prompt).toContain("street");
    expect(prompt).toContain("running");
    expect(prompt).toContain("looking at viewer");
    expect(prompt).toContain("full body");
    expect(prompt).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("recognizes common Chinese and English refusal responses", () => {
    expect(isTuiwenPromptRefusal("Sorry, I can't help with that request.")).toBe(true);
    expect(isTuiwenPromptRefusal("抱歉，我无法协助生成该内容。")).toBe(true);
    expect(isTuiwenPromptRefusal("1girl, night, rain, cinematic lighting")).toBe(false);
  });
});
