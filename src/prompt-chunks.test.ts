import { describe, expect, it } from "vitest";
import { resolvePromptChunkTop } from "./PromptChunks";

describe("custom prompt chunk popover placement", () => {
  it("aligns the side popover with the trigger top", () => {
    expect(resolvePromptChunkTop("top-right", 240, 274, 900, 420)).toBe(240);
  });

  it("keeps the aligned popover inside the viewport near the bottom", () => {
    expect(resolvePromptChunkTop("top-right", 760, 794, 900, 420)).toBe(468);
  });
});
