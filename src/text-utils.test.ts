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
    expect(applyAutocompleteTag("1girl, blusmile", anchorFor("1girl, blusmile", 10), "blue hair")?.value).toBe("1girl, blue hair, ");
  });

  it("keeps line breaks after the caret", () => {
    const value = "1girl, blu\nsmile";
    const next = applyAutocompleteTag(value, anchorFor(value, 10), "blue hair");
    expect(next).toEqual({ value: "1girl, blue hair, \nsmile", caret: 18 });
    // The caret stays on the first line, right after the inserted ", ".
    expect(next!.value.slice(0, next!.caret)).toBe("1girl, blue hair, ");
    const blank = "1girl, blu\n\nsmile, red eyes";
    expect(applyAutocompleteTag(blank, anchorFor(blank, 10), "blue hair"))
      .toEqual({ value: "1girl, blue hair, \n\nsmile, red eyes", caret: 18 });
    // Only spaces, tabs and one comma on the caret's line give way.
    const spaced = "1girl, blu ,\t\n  smile";
    expect(applyAutocompleteTag(spaced, anchorFor(spaced, 10), "blue hair")?.value).toBe("1girl, blue hair, \n  smile");
    const windows = "1girl, blu \r\nsmile";
    expect(applyAutocompleteTag(windows, anchorFor(windows, 10), "blue hair")?.value).toBe("1girl, blue hair, \r\nsmile");
    const nextLineComma = "1girl, blu\n, smile";
    expect(applyAutocompleteTag(nextLineComma, anchorFor(nextLineComma, 10), "blue hair")?.value).toBe("1girl, blue hair, \n, smile");
  });

  it("keeps Chinese text right after the caret", () => {
    expect(applyAutocompleteTag("蓝眼", anchorFor("蓝眼", 1), "blue eyes")).toEqual({ value: "blue eyes, 眼", caret: 11 });
    expect(applyAutocompleteTag("1girl, 蓝眼微笑", anchorFor("1girl, 蓝眼微笑", 9), "blue eyes"))
      .toEqual({ value: "1girl, blue eyes, 微笑", caret: 18 });
    expect(applyAutocompleteTag("1girl, blu微笑", anchorFor("1girl, blu微笑", 10), "blue hair")?.value).toBe("1girl, blue hair, 微笑");
  });

  it("replaces an already typed multi-word phrase instead of repeating it", () => {
    const complete = (value: string, tag: string) => applyAutocompleteTag(value, anchorFor(value, value.length), tag)?.value;
    expect(applyAutocompleteTag("1girl, long ha", anchorFor("1girl, long ha", 14), "long hair"))
      .toEqual({ value: "1girl, long hair, ", caret: 18 });
    expect(complete("1girl，long ha", "long hair")).toBe("1girl，long hair, ");
    expect(complete("1girl, very ha", "hat")).toBe("1girl, very hat, ");
    expect(complete("1girl、long ha", "long hair")).toBe("1girl、long hair, ");
    expect(complete("a girl with long ha", "long hair")).toBe("a girl with long hair, ");
    expect(complete("1girl, Long  ha", "long hair")).toBe("1girl, long hair, ");
    expect(complete("1girl, long ha", "long_hair")).toBe("1girl, long_hair, ");
    expect(complete("1girl\nlong ha", "long hair")).toBe("1girl\nlong hair, ");
  });

  it("keeps weight and bracket syntax in front of a multi-word tag", () => {
    const complete = (value: string, tag: string) => applyAutocompleteTag(value, anchorFor(value, value.length), tag)?.value;
    expect(complete("{{long ha", "long hair")).toBe("{{long hair, ");
    expect(complete("1girl, {long ha", "long hair")).toBe("1girl, {long hair, ");
    expect(complete("1.2::long ha", "long hair")).toBe("1.2::long hair, ");
    expect(complete("1girl, -1::long ha", "long hair")).toBe("1girl, -1::long hair, ");
    expect(complete("[long ha", "long hair")).toBe("[long hair, ");
    expect(complete("(very long ha", "very long hair")).toBe("(very long hair, ");
    expect(complete("1.2::blue hair:: long ha", "long hair")).toBe("1.2::blue hair:: long hair, ");
  });

  it("refuses to insert when the anchored text has changed", () => {
    const anchor = anchorFor("1girl, blu", 10);
    expect(applyAutocompleteTag("1girl, red", anchor, "blue hair")).toBeNull();
    expect(applyAutocompleteTag("", anchor, "blue hair")).toBeNull();
    expect(applyAutocompleteTag("1girl, blu", anchor, "")).toBeNull();
  });
});
