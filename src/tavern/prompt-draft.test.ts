import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { editedPromptPatch, readPromptDraft } from "./prompt-draft";

describe("user-owned tavern prompt drafts", () => {
  it.each(["", "   ", "lowres, "])("opening %j never writes a default or advances updatedAt", negativePrompt => {
    const visual = { negativePrompt, stylePrompt: "" };
    const draft = readPromptDraft(visual);
    expect(draft.negative).toBe(negativePrompt);
    expect(editedPromptPatch(draft, visual, new Set())).toEqual({});
  });
  it("explicit clearing stays empty rather than restoring defaults", () => {
    expect(editedPromptPatch({ negative: "", style: "" }, { negativePrompt: "lowres", stylePrompt: "" }, new Set(["negative"])))
      .toEqual({ negativePrompt: "" });
  });
  it("a style edit does not silently normalize an untouched negative prompt", () => {
    expect(editedPromptPatch({ negative: "", style: "watercolor" }, { negativePrompt: "  ", stylePrompt: "" }, new Set(["style"])))
      .toEqual({ stylePrompt: "watercolor" });
  });
  it("negative edits do not overwrite an external style selection", () => {
    expect(editedPromptPatch({ negative: "blur", style: "old" }, { negativePrompt: "", stylePrompt: "new" }, new Set(["negative"])))
      .toEqual({ negativePrompt: "blur" });
  });
  it("missing visual settings initialize empty", () => expect(readPromptDraft()).toEqual({ negative: "", style: "" }));
  it("Windows runtime do not reintroduce implicit negative defaults", () => {
    for (const file of ["electron/ipc/agent-runtime.ts", "src/AgentPage.tsx"]) {
      const code = readFileSync(file, "utf8");
      expect(code).not.toMatch(/negativePrompt\.trim\(\)\s*\|\|\s*DEFAULT_TAVERN_NEGATIVE_PROMPT/);
      expect(code).not.toMatch(/negativePrompt\.trim\(\)\.isEmpty\s*\?\s*defaultTavernNegativePrompt/);
      expect(code).not.toMatch(/:\s*defaultTavernNegativePrompt/);
    }
  });
});
