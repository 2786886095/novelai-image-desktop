import { describe, expect, it } from "vitest";
import { buildArtistCombinations, createArtistLabRandom, formatArtistCombination } from "./artist-lab";

describe("artist lab combination search", () => {
  it("formats NovelAI V4 numeric emphasis around each artist tag", () => {
    expect(formatArtistCombination([
      { name: "foo_bar", weight: 1.2 },
      { name: "baz", weight: 0.8 },
    ])).toBe("1.2::artist:foo_bar ::, 0.8::artist:baz ::");
  });

  it("starts target matching with stable single-artist baselines", () => {
    const candidates = buildArtistCombinations(["a", "b", "c"], 3, "match", () => 0.5);
    expect(candidates.map((item) => item.prompt)).toEqual([
      "1::artist:a ::",
      "1::artist:b ::",
      "1::artist:c ::",
    ]);
  });

  it("deduplicates names and bounds random exploration", () => {
    let value = 0;
    const candidates = buildArtistCombinations(["a", "a", "b", "c"], 8, "random", () => {
      value = (value + 0.173) % 1;
      return value;
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(new Set(candidates.map((item) => item.id)).size).toBe(candidates.length);
  });

  it("recreates the same preview queue from the fixed seed", () => {
    const first = buildArtistCombinations(["a", "b", "c", "d"], 10, "random", createArtistLabRandom(42));
    const second = buildArtistCombinations(["a", "b", "c", "d"], 10, "random", createArtistLabRandom(42));
    expect(first).toEqual(second);
  });
});
