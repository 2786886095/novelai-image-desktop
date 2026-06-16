import { describe, it, expect } from "vitest";
import { estimateAnlas } from "./anlas";
import { DEFAULT_PARAMS } from "./types";

describe("estimateAnlas", () => {
  it("is free for Opus at <=1024^2, <=28 steps, no SMEA", () => {
    const p = { ...DEFAULT_PARAMS, width: 1024, height: 1024, steps: 28, smea: false };
    const est = estimateAnlas(p, 1, 3);
    expect(est.free).toBe(true);
    expect(est.total).toBe(0);
  });

  it("charges Opus above the free resolution", () => {
    const p = { ...DEFAULT_PARAMS, width: 1216, height: 1216, steps: 28 };
    const est = estimateAnlas(p, 1, 3);
    expect(est.free).toBe(false);
    expect(est.perImage).toBeGreaterThan(0);
  });

  it("charges when SMEA is on even at free resolution", () => {
    const p = { ...DEFAULT_PARAMS, width: 1024, height: 1024, steps: 28, smea: true };
    expect(estimateAnlas(p, 1, 3).free).toBe(false);
  });

  it("is never free for non-Opus tiers", () => {
    const p = { ...DEFAULT_PARAMS, width: 1024, height: 1024, steps: 28, smea: false };
    expect(estimateAnlas(p, 1, 1).free).toBe(false);
  });

  it("multiplies per-image cost by batch count", () => {
    const p = { ...DEFAULT_PARAMS, width: 1216, height: 1216, steps: 28 };
    const one = estimateAnlas(p, 1, 3);
    const four = estimateAnlas(p, 4, 3);
    expect(four.total).toBe(one.perImage * 4);
  });
});
