import { describe, expect, it } from "vitest";
import { nextArtistBatch, planArtistImages, planArtistRounds, restoreArtistIteration } from "./artist-iteration-budget";

describe("artist iteration budgets", () => {
  it("defaults to 300 images including baseline, 38 rounds of at most eight", () => {
    expect(restoreArtistIteration(null)).toEqual({ batchSize: 8, imageBudget: 300, iterationRounds: 38 });
    let used = 1;
    for (let round = 0; round < 38; round++) used += nextArtistBatch(round, 38, used, 300, 8);
    expect(used).toBe(300);
    expect(nextArtistBatch(37, 38, 297, 300, 8)).toBe(3);
    expect(nextArtistBatch(38, 38, 299, 300, 8)).toBe(0);
  });
  it("supports user-defined rounds and counts above the former 240 ceiling", () => {
    expect(planArtistRounds(300, 8)).toEqual({ imageBudget: 2401, iterationRounds: 300 });
    expect(planArtistImages(10000, 8)).toEqual({ imageBudget: 10000, iterationRounds: 1250 });
    expect(planArtistRounds(25, 12)).toEqual({ imageBudget: 301, iterationRounds: 25 });
  });
  it("preserves legacy budgets and new round settings on restore", () => {
    expect(restoreArtistIteration({ imageBudget: 60, batchSize: 8 })).toEqual({ imageBudget: 60, batchSize: 8, iterationRounds: 8 });
    const plan = { ...planArtistRounds(50, 8), batchSize: 8 };
    expect(restoreArtistIteration(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
  it("normalizes invalid, fractional and corrupt persisted values", () => {
    expect(planArtistRounds(3.9, 8)).toEqual({ imageBudget: 25, iterationRounds: 3 });
    expect(restoreArtistIteration({ imageBudget: NaN, batchSize: Infinity, iterationRounds: -5 })).toEqual({ imageBudget: 300, batchSize: 8, iterationRounds: 1 });
    expect(planArtistRounds(Number.MAX_SAFE_INTEGER, 8)).toEqual(planArtistImages(300, 8));
    expect(nextArtistBatch(0, 1, 300, 300, 8)).toBe(0);
  });
});
