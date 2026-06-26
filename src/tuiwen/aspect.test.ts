import { describe, expect, it } from "vitest";
import { applyTuiwenAspectToParams, buildTuiwenAspectPlan, chooseTuiwenNaiSize } from "./aspect";
import { DEFAULT_PARAMS } from "../types";

describe("tuiwen aspect mapping", () => {
  it("maps vertical video to a portrait NAI size near 9:16 without crossing the Opus pixel line", () => {
    const size = chooseTuiwenNaiSize("9:16");
    expect(size.width).toBeLessThan(size.height);
    expect(size.width % 64).toBe(0);
    expect(size.height % 64).toBe(0);
    expect(size.width * size.height).toBeLessThanOrEqual(1024 * 1024);
    expect(Math.abs(size.width / size.height - 9 / 16)).toBeLessThan(0.04);
  });

  it("keeps square video square and Opus-free by default", () => {
    const plan = buildTuiwenAspectPlan({ aspectRatio: "1:1", width: 1080, height: 1080 });
    expect(plan.nai).toMatchObject({ width: 1024, height: 1024 });
    expect(plan.opusFreeWarning).toBeNull();
    expect(plan.cover.cropX).toBe(0);
    expect(plan.cover.cropY).toBe(0);
  });

  it("uses the same mapping when applying an aspect ratio to generation params", () => {
    const next = applyTuiwenAspectToParams({ ...DEFAULT_PARAMS, width: 1024, height: 1024 }, "16:9");
    expect(next.width).toBeGreaterThan(next.height);
    expect(next.width * next.height).toBeLessThanOrEqual(1024 * 1024);
  });

  it("warns when a user-selected generation size or step count crosses the Opus free cliff", () => {
    const plan = buildTuiwenAspectPlan(
      { aspectRatio: "9:16", width: 1080, height: 1920 },
      { width: 1024, height: 1536, steps: 30 },
    );
    expect(plan.opusFreeWarning).toContain("Opus 免费线");
  });
});
