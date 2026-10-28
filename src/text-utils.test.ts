import { describe, it, expect } from "vitest";
import { applyAutocompleteTag, fmtCount, wordAtCursor } from "./text-utils";

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

describe("applyAutocompleteTag", () => {
  const anchorFor = (value: string, cursor: number) => ({ ...wordAtCursor(value, cursor), cursor });

  it("replaces the word the suggestions were made for, wherever the caret is now", () => {
    const value = "1girl, blu, smile";
    expect(applyAutocompleteTag(value, anchorFor(value, 10), "blue hair")).toEqual({ value: "1girl, blue hair, smile", caret: 18 });
  });

  it("completes the rest of a partial word and keeps a single separator", () => {
    expect(applyAutocompleteTag("1girl, bluxx , smile", anchorFor("1girl, bluxx , smile", 10), "blue hair"))
      .toEqual({ value: "1girl, blue hair, smile", caret: 18 });
    expect(applyAutocompleteTag("1girl, blu", anchorFor("1girl, blu", 10), "blue hair"))
      .toEqual({ value: "1girl, blue hair, ", caret: 18 });
    expect(applyAutocompleteTag("蓝眼", anchorFor("蓝眼", 1), "blue eyes")).toEqual({ value: "blue eyes, ", caret: 11 });
  });

  it("replaces an already typed multi-word phrase instead of repeating it", () => {
    expect(applyAutocompleteTag("1girl, long ha", anchorFor("1girl, long ha", 14), "long hair"))
      .toEqual({ value: "1girl, long hair, ", caret: 18 });
    expect(applyAutocompleteTag("1girl，long ha", anchorFor("1girl，long ha", 13), "long hair")?.value).toBe("1girl，long hair, ");
    expect(applyAutocompleteTag("1girl, very ha", anchorFor("1girl, very ha", 14), "hat")?.value).toBe("1girl, very hat, ");
  });

  it("refuses to insert when the anchored text has changed", () => {
    const anchor = anchorFor("1girl, blu", 10);
    expect(applyAutocompleteTag("1girl, red", anchor, "blue hair")).toBeNull();
    expect(applyAutocompleteTag("", anchor, "blue hair")).toBeNull();
    expect(applyAutocompleteTag("1girl, blu", anchor, "")).toBeNull();
  });
});
