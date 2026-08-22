import { describe, expect, it } from "vitest";
import { CURATED_ARTIST_TAGS } from "./curated-artists";

describe("jointly reviewed artist candidates", () => {
  it("contains only unique, current, established artist tags", () => {
    expect(CURATED_ARTIST_TAGS).toHaveLength(33);
    expect(new Set(CURATED_ARTIST_TAGS.map((item) => item.name)).size).toBe(33);
    expect(CURATED_ARTIST_TAGS.every((item) => !item.deprecated)).toBe(true);
    expect(CURATED_ARTIST_TAGS.every((item) => item.postCount >= 200)).toBe(true);
  });
});
