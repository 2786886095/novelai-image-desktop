import { describe, it, expect } from "vitest";
import { relatedTags } from "./related-tags";

describe("relatedTags", () => {
  it("returns co-occurring tags for a known anchor", () => {
    const out = relatedTags("1girl, maid");
    const tags = out.map((r) => r.tag);
    expect(tags).toContain("apron");
    expect(tags).toContain("maid headdress");
  });

  it("excludes tags already present in the prompt", () => {
    const out = relatedTags("maid, apron");
    expect(out.map((r) => r.tag)).not.toContain("apron");
  });

  it("returns empty for an empty prompt", () => {
    expect(relatedTags("")).toEqual([]);
  });

  it("ignores NovelAI weight syntax around tags", () => {
    const out = relatedTags("{cat ears}");
    expect(out.map((r) => r.tag)).toContain("cat tail");
  });

  it("respects the limit", () => {
    expect(relatedTags("1girl, maid, cat ears, night", 3).length).toBeLessThanOrEqual(3);
  });
});
