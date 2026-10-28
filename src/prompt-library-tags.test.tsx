import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  addPromptTagToInput,
  collectPromptTags,
  matchesPromptLibraryEntry,
  mergePromptTags,
  normalizePromptTags,
  PROMPT_TAG_LIMIT,
  PROMPT_TAG_MAX_LENGTH,
  promptTagField,
  promptTagText,
  UNTAGGED_PROMPT_FILTER,
} from "./prompt-library-tags";
import { appendPromptText } from "./prompt-append";
import { PromptTagFilter, PromptTagInput } from "./components/PromptTagControls";

describe("saved prompt tags", () => {
  it("normalizes typed or stored tags without touching their spelling", () => {
    expect(normalizePromptTags(" 角色, #服装，夜景 ; night  sky\n角色 ")).toEqual(["角色", "服装", "夜景", "night sky"]);
    expect(normalizePromptTags(["Outfit", "outfit", "", 3, null, "#  Night"])).toEqual(["Outfit", "Night"]);
    expect(normalizePromptTags(undefined)).toEqual([]);
    expect(normalizePromptTags({ tags: ["x"] })).toEqual([]);
    expect(normalizePromptTags(["x".repeat(80)])[0]).toHaveLength(PROMPT_TAG_MAX_LENGTH);
    expect(normalizePromptTags(Array.from({ length: 40 }, (_, i) => `t${i}`))).toHaveLength(PROMPT_TAG_LIMIT);
  });

  it("omits the field for untagged entries so their stored shape is unchanged", () => {
    expect(promptTagField([])).toEqual({});
    expect(promptTagField(" , ")).toEqual({});
    expect(promptTagField("a, b")).toEqual({ tags: ["a", "b"] });
    expect(mergePromptTags(["a", "B"], undefined, ["b", "c"])).toEqual(["a", "B", "c"]);
  });

  it("adds a suggested tag to the editor text once", () => {
    expect(addPromptTagToInput("", "角色")).toBe("角色");
    expect(addPromptTagToInput("角色, 服装", "夜景")).toBe("角色, 服装, 夜景");
    expect(addPromptTagToInput("角色, 服装", "服装")).toBe("角色, 服装");
  });

  it("counts tags across a library, most used first", () => {
    expect(collectPromptTags([
      { tags: ["b", "a"] },
      { tags: ["A"] },
      {},
      { tags: ["c", "a"] },
    ])).toEqual([
      { tag: "a", count: 3 },
      { tag: "b", count: 1 },
      { tag: "c", count: 1 },
    ]);
  });

  it("filters by chip, #tag token and phrase", () => {
    const entry = { tags: ["服装", "Night"] };
    const fields = ["夜景少女", "1girl, blue hair, white dress"];
    expect(matchesPromptLibraryEntry(entry, fields, "")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "blue hair")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "hair blue")).toBe(false);
    expect(matchesPromptLibraryEntry(entry, fields, "night")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "#服装")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "#服")).toBe(false);
    expect(matchesPromptLibraryEntry(entry, fields, "#night white dress")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "#night red dress")).toBe(false);
    expect(matchesPromptLibraryEntry(entry, fields, "", "服装")).toBe(true);
    expect(matchesPromptLibraryEntry(entry, fields, "", "角色")).toBe(false);
    expect(matchesPromptLibraryEntry(entry, fields, "", UNTAGGED_PROMPT_FILTER)).toBe(false);
    expect(matchesPromptLibraryEntry({}, fields, "", UNTAGGED_PROMPT_FILTER)).toBe(true);
    expect(matchesPromptLibraryEntry({}, ["c# notes"], "#")).toBe(true);
  });

  it("has complete labels for every UI language", () => {
    for (const language of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
      for (const value of Object.values(promptTagText(language))) expect(value.trim()).not.toBe("");
    }
    expect(promptTagText(undefined)).toEqual(promptTagText("zh-CN"));
  });

  it("renders filter chips only when a tag exists, plus an untagged chip", () => {
    const outfit = "服装";
    expect(renderToStaticMarkup(<PromptTagFilter items={[{}, { tags: [] }]} value="" onChange={() => {}} language="zh-CN" />)).toBe("");
    const html = renderToStaticMarkup(<PromptTagFilter items={[{ tags: [outfit] }, {}]} value={outfit} onChange={() => {}} language="zh-CN" />);
    expect(html).toContain("#服装");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("未加标签");
    const input = renderToStaticMarkup(<PromptTagInput value={outfit} onChange={() => {}} suggestions={[outfit, "夜景"]} language="en-US" />);
    expect(input).toContain("+ 夜景");
    expect(input).not.toContain("+ 服装");
  });
});

describe("appending saved prompt text", () => {
  it("joins with one comma and keeps the saved text literal", () => {
    expect(appendPromptText("1girl", "1.2::blue hair::, smile")).toBe("1girl, 1.2::blue hair::, smile");
    expect(appendPromptText("1girl,", "smile")).toBe("1girl, smile");
    expect(appendPromptText("1girl,  \n", "smile")).toBe("1girl, smile");
    expect(appendPromptText("1girl，", "smile")).toBe("1girl， smile");
    expect(appendPromptText("  ", "smile")).toBe("smile");
    expect(appendPromptText("1girl", "  ")).toBe("1girl");
    expect(appendPromptText("line one\nline two", "a\nb")).toBe("line one\nline two, a\nb");
  });
});
