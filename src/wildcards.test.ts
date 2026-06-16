import { describe, it, expect } from "vitest";
import { expandWildcards, hasWildcards } from "./wildcards";

describe("expandWildcards", () => {
  it("picks the first option with rand=0", () => {
    expect(expandWildcards("1girl, {red|blue|green} hair", () => 0)).toBe("1girl, red hair");
  });

  it("picks the last option with rand near 1", () => {
    expect(expandWildcards("{red|blue|green} hair", () => 0.99)).toBe("green hair");
  });

  it("leaves NovelAI weight syntax {tag} untouched (no pipe)", () => {
    expect(expandWildcards("{masterpiece}, 1girl", () => 0)).toBe("{masterpiece}, 1girl");
  });

  it("leaves [tag] de-emphasis untouched", () => {
    expect(expandWildcards("[low quality]", () => 0)).toBe("[low quality]");
  });

  it("expands nested wildcards innermost-first", () => {
    expect(expandWildcards("{a|{b|c}}", () => 0)).toBe("a");
    expect(expandWildcards("{a|{b|c}}", () => 0.99)).toBe("c");
  });

  it("trims whitespace around chosen option", () => {
    expect(expandWildcards("{ red | blue }", () => 0)).toBe("red");
  });

  it("returns input unchanged when there is no wildcard", () => {
    expect(expandWildcards("1girl, solo")).toBe("1girl, solo");
  });

  it("hasWildcards detects only piped braces", () => {
    expect(hasWildcards("{a|b}")).toBe(true);
    expect(hasWildcards("{weight}")).toBe(false);
    expect(hasWildcards("plain")).toBe(false);
  });
});
