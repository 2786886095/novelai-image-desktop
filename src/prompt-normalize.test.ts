import { describe, it, expect } from "vitest";
import { normalizePrompt, DEFAULT_NORMALIZE_OPTIONS, NormalizeOptions } from "./prompt-normalize";

const opts = (over: Partial<NormalizeOptions> = {}): NormalizeOptions => ({
  ...DEFAULT_NORMALIZE_OPTIONS,
  ...over,
});

describe("normalizePrompt", () => {
  it("lowercases, converts underscores and trims tags", () => {
    expect(normalizePrompt("1Girl, Blue_Eyes ,  Long_Hair", opts())).toBe(
      "1girl, blue eyes, long hair",
    );
  });

  it("converts full-width punctuation and newlines to a comma list", () => {
    expect(normalizePrompt("1girl，solo\nblue eyes", opts())).toBe("1girl, solo, blue eyes");
  });

  it("strips decorative brackets but keeps NovelAI weight braces", () => {
    expect(normalizePrompt("{blue eyes}, 【cute】, [old]", opts())).toBe(
      "{blue eyes}, cute, [old]",
    );
  });

  it("removes quality / artist boosters", () => {
    expect(normalizePrompt("masterpiece, best quality, 1girl, artist:foo", opts())).toBe("1girl");
  });

  it("removes non-ASCII (leftover Chinese) characters", () => {
    expect(normalizePrompt("1girl, 蓝眼睛blue eyes, 城市", opts())).toBe("1girl, blue eyes");
  });

  it("dedupes case-insensitively, keeping the first", () => {
    expect(normalizePrompt("1girl, Solo, solo, 1GIRL", opts())).toBe("1girl, solo");
  });

  it("preserves wildcard groups verbatim", () => {
    expect(
      normalizePrompt("1girl, {red|blue|GREEN} Hair, [a|b]", opts()),
    ).toBe("1girl, {red|blue|GREEN} hair, [a|b]");
  });

  it("respects disabled options", () => {
    expect(
      normalizePrompt("1Girl, Blue_Eyes", opts({ lowercase: false, underscoreToSpace: false })),
    ).toBe("1Girl, Blue_Eyes");
  });

  it("returns empty string for blank input", () => {
    expect(normalizePrompt("   \n  ", opts())).toBe("");
  });
});
