import { describe, expect, it } from "vitest";
import {
  splitPromptTags,
  parseWeightedTag,
  serializeWeightedTag,
  formatMultiplier,
  setTagLevelInPrompt,
} from "./prompt-weight";

describe("splitPromptTags", () => {
  it("splits on commas and trims, dropping empties", () => {
    expect(splitPromptTags("1girl, , blue eyes,  ")).toEqual(["1girl", "blue eyes"]);
  });
});

describe("parseWeightedTag", () => {
  it("reads neutral tags", () => {
    expect(parseWeightedTag("blue eyes")).toMatchObject({ core: "blue eyes", level: 0 });
  });
  it("counts {} as positive levels", () => {
    expect(parseWeightedTag("{{smile}}")).toMatchObject({ core: "smile", level: 2 });
  });
  it("counts [] as negative levels", () => {
    expect(parseWeightedTag("[blush]")).toMatchObject({ core: "blush", level: -1 });
  });
});

describe("serializeWeightedTag", () => {
  it("round-trips with parse", () => {
    expect(serializeWeightedTag("smile", 2)).toBe("{{smile}}");
    expect(serializeWeightedTag("blush", -1)).toBe("[blush]");
    expect(serializeWeightedTag("solo", 0)).toBe("solo");
  });
});

describe("formatMultiplier", () => {
  it("is empty at neutral and signed elsewhere", () => {
    expect(formatMultiplier(0)).toBe("");
    expect(formatMultiplier(1)).toBe("×1.05");
  });
});

describe("setTagLevelInPrompt", () => {
  it("bumps a single tag and clamps to 5", () => {
    expect(setTagLevelInPrompt("1girl, smile, solo", 1, 1)).toBe("1girl, {smile}, solo");
    expect(setTagLevelInPrompt("smile", 0, 99)).toBe("{{{{{smile}}}}}");
  });
  it("returns the prompt unchanged for out-of-range index", () => {
    expect(setTagLevelInPrompt("1girl", 5, 1)).toBe("1girl");
  });
});
