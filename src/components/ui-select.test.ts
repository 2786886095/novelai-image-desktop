import { describe, expect, it } from "vitest";
import { findTypeaheadOptionIndex, type SelectMenuOption } from "./ui";

const options: SelectMenuOption[] = [
  { value: "alpha", label: "Alpha" },
  { value: "disabled", label: "Delta old", disabled: true },
  { value: "delta", label: "Delta" },
  { value: "date", label: "Date" },
  { value: "2019-q3", label: "2019 Q3" },
];

describe("SelectMenu type-ahead", () => {
  it("jumps by prefix and skips disabled options", () => {
    expect(findTypeaheadOptionIndex(options, "d", 0)).toBe(2);
    expect(findTypeaheadOptionIndex(options, "da", 2)).toBe(3);
  });

  it("wraps and supports numeric time-range labels", () => {
    expect(findTypeaheadOptionIndex(options, "2", 4)).toBe(4);
    expect(findTypeaheadOptionIndex(options, "missing", 0)).toBe(-1);
  });
});
