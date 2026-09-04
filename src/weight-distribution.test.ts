import { describe, expect, it } from "vitest";
import { generatePopularArtistRecipes } from "./artist-recipe";
import type { ArtistTagRecord } from "./artist-lab";
import { drawAllV5ArtistWeights } from "./v5-artist-weight-repair";
import {
  buildWeightDistributionPreview,
  controlledWeightPdf,
  normalizeWeightDistribution,
  sampleControlledWeight,
  softBalanceWeights,
} from "./weight-distribution";

describe("controlled artist-weight distribution", () => {
  it("normalizes mode and independent dispersion into valid bounds", () => {
    expect(normalizeWeightDistribution({ min: 2, max: .1, mode: 9, leftDispersion: -1, rightDispersion: 2 }))
      .toEqual({ min: .1, max: 2, mode: 2, leftDispersion: 0, rightDispersion: 1, softBalance: 0 });
  });

  it("is deterministic and always stays inside the selected range", () => {
    const values = [0, .25, .5, .75, .99];
    let index = 0;
    const random = () => values[index++ % values.length];
    const config = { min: .1, max: 2, mode: .5, leftDispersion: .3, rightDispersion: .7, softBalance: 0 };
    const result = Array.from({ length: 20 }, () => sampleControlledWeight(config, random));
    expect(result.every((value) => value >= .1 && value <= 2)).toBe(true);
    expect(result.slice(0, 6)).toEqual([0.5, 0.9, 0.5, 0.7, 1.5, 0.5]);
  });

  it("clusters more tightly when dispersion is lower", () => {
    const sequence = Array.from({ length: 400 }, (_, index) => ((index * 73) % 397) / 397);
    const sample = (dispersion: number) => {
      let index = 0;
      return Array.from({ length: 200 }, () => sampleControlledWeight({
        min: .1, max: 2, mode: .6,
        leftDispersion: dispersion,
        rightDispersion: dispersion,
        softBalance: 0,
      }, () => sequence[index++ % sequence.length]));
    };
    const distance = (values: number[]) => values.reduce((sum, value) => sum + Math.abs(value - .6), 0) / values.length;
    expect(distance(sample(.1))).toBeLessThan(distance(sample(.9)));
  });

  it("drives both random-artist and input-artist draws in advanced mode", () => {
    const pool: ArtistTagRecord[] = [
      { id: 1, name: "alpha", postCount: 100, deprecated: false },
      { id: 2, name: "beta", postCount: 90, deprecated: false },
    ];
    const fixed = { min: .7, max: .7, mode: .7, leftDispersion: 0, rightDispersion: 0, softBalance: 0 };
    const randomRecipes = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 2,
      maxArtists: 2,
      artistWeightMin: .7,
      artistWeightMax: .7,
      artistWeightDistribution: fixed,
      mutateAuxiliary: false,
      random: () => .25,
    });
    expect(randomRecipes[0].artists.every((artist) => artist.weight === .7)).toBe(true);

    const inputRecipes = drawAllV5ArtistWeights(
      "artist:alpha, masterpiece",
      2,
      .7,
      .7,
      () => .25,
      fixed,
    );
    expect(inputRecipes).toHaveLength(2);
    expect(inputRecipes.every((item) => item.prompt.includes("0.7::"))).toBe(true);
  });

  it("soft-balances the complete string with one shared offset", () => {
    const config = { min: .1, max: 2, mode: .8, leftDispersion: .4, rightDispersion: .4, softBalance: .5 };
    const balanced = softBalanceWeights([.2, .4, .8], config);
    expect(balanced).toEqual([.4, .6, 1]);
    expect(balanced[1] - balanced[0]).toBeCloseTo(.2, 8);
    expect(balanced[2] - balanced[1]).toBeCloseTo(.4, 8);
  });

  it("builds an exact probability preview whose bins sum to one", () => {
    const bins = buildWeightDistributionPreview({
      min: .2, max: 1.2, mode: .8,
      leftDispersion: .4, rightDispersion: .7, softBalance: .5,
    }, 40);
    expect(bins).toHaveLength(40);
    expect(bins.reduce((sum, bin) => sum + bin.probability, 0)).toBeCloseTo(1, 10);
    const peak = bins.reduce((best, bin) => bin.probability > best.probability ? bin : best);
    expect(peak.center).toBeGreaterThan(.7);
    expect(peak.center).toBeLessThan(.9);
  });

  it("uses the same normalized split-beta density for the preview curve", () => {
    const config = {
      min: .2, max: 1.5, mode: .7,
      leftDispersion: .2, rightDispersion: .6, softBalance: 0,
    };
    const steps = 20_000;
    const width = (config.max - config.min) / steps;
    let area = 0;
    for (let index = 0; index < steps; index++) {
      const x = config.min + (index + .5) * width;
      area += controlledWeightPdf(config, x) * width;
    }
    expect(area).toBeCloseTo(1, 3);
    expect(controlledWeightPdf(config, config.mode, "left"))
      .toBeGreaterThan(controlledWeightPdf(config, config.mode - .25));
    expect(controlledWeightPdf(config, config.mode, "right"))
      .toBeGreaterThan(controlledWeightPdf(config, config.mode + .4));
  });

  it("applies soft balance to random-artist and input-string recipes", () => {
    const config = { min: .1, max: 1.5, mode: .8, leftDispersion: 1, rightDispersion: 1, softBalance: 1 };
    const pool: ArtistTagRecord[] = [
      { id: 1, name: "alpha", postCount: 100, deprecated: false },
      { id: 2, name: "beta", postCount: 90, deprecated: false },
      { id: 3, name: "gamma", postCount: 80, deprecated: false },
    ];
    const randomRecipes = generatePopularArtistRecipes(pool, {
      count: 1, minArtists: 3, maxArtists: 3,
      artistWeightDistribution: config, mutateAuxiliary: false,
      random: (() => { const values = [.2, .4, .6, .8, .1, .9]; let i = 0; return () => values[i++ % values.length]; })(),
    });
    const mean = randomRecipes[0].artists.reduce((sum, artist) => sum + artist.weight, 0) / randomRecipes[0].artists.length;
    expect(mean).toBeCloseTo(.8, 1);

    const input = drawAllV5ArtistWeights("artist:alpha, artist:beta, masterpiece", 1, .1, 1.5, () => .9, config)[0];
    const weights = input.prompt.match(/\d+(?:\.\d+)?::/g)?.map((value) => Number(value.slice(0, -2))) ?? [];
    expect(weights.reduce((sum, weight) => sum + weight, 0) / weights.length).toBeCloseTo(.8, 1);
  });
});
