import { describe, it, expect } from "vitest";
import { fmtCount, wordAtCursor } from "./text-utils";

describe("fmtCount", () => {
  it("formats millions", () => expect(fmtCount(1_900_000)).toBe("1.9M"));
  it("formats thousands", () => expect(fmtCount(12_000)).toBe("12k"));
  it("leaves small numbers", () => expect(fmtCount(420)).toBe("420"));
});

describe("wordAtCursor", () => {
  it("returns the latin word left of the cursor", () => {
    const r = wordAtCursor("1girl, blue", 11);
    expect(r.word).toBe("blue");
    expect(r.start).toBe(7);
  });

  it("captures CJK runs so Chinese triggers autocomplete", () => {
    const r = wordAtCursor("1girl, 蓝眼", 9);
    expect(r.word).toBe("蓝眼");
  });

  it("stops at commas and spaces", () => {
    expect(wordAtCursor("a, b", 4).word).toBe("b");
  });

  it("returns empty at a boundary", () => {
    expect(wordAtCursor("a, ", 3).word).toBe("");
  });
});
