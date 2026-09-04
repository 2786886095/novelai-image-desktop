import { describe, expect, it } from "vitest";
import {
  DSH_IMAGE_AI_PROVENANCE,
  buildDshImageAiSystemAddon,
  injectDshImageAiSystemPrompt,
} from "./dsh-reverse-convert";

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
});
