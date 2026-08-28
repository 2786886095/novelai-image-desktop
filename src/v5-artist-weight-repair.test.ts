import { describe, expect, it } from "vitest";
import {
  countV5PromptTags,
  drawAllV5ArtistWeights,
  MAX_V5_ARTIST_REPAIR_MULTIPLIER,
  MIN_V5_ARTIST_REPAIR_MULTIPLIER,
  normalizeV45ArtistSyntax,
  repairV45ArtistCandidatesForV5,
  repairV45ArtistWeightsForV5,
} from "./v5-artist-weight-repair";

const MALFORMED_MIXED_PROMPT = String.raw`xiaoluo\_xl ，beijuu，yd\_(orange\_maru，2::ohisashiburi:: ，2::nonco :: ，no halo，::,yutokamizu,,1::mx2j:: ,doremi (doremi4704),impasto ，， ,{{extremely detailed CG}}, {{{best quality}}}, {{ultra-detailed}}, {{illustration}}`;

describe("repairV45ArtistWeightsForV5", () => {
  it("downweights every tag while classifying only reviewed names as artists", () => {
    const result = repairV45ArtistWeightsForV5(
      MALFORMED_MIXED_PROMPT,
      () => 0,
    );

    expect(MIN_V5_ARTIST_REPAIR_MULTIPLIER).toBeCloseTo(1 / 3);
    expect(MAX_V5_ARTIST_REPAIR_MULTIPLIER).toBeCloseTo(1 / 2);
    expect(result.output).toBe(
      "0.33::artist:xiaoluo_xl ::, 0.33::artist:beijuu ::, 0.33::artist:yd_(orange_maru) ::, 0.67::artist:ohisashiburi ::, 0.67::artist:nonco ::, 0.33::no halo ::, 0.33::artist:yutokamizu ::, 0.33::artist:mx2j ::, 0.33::artist:doremi_(doremi4704) ::, 0.33::impasto ::, 0.37::extremely detailed CG ::, 0.39::best quality ::, 0.37::ultra-detailed ::, 0.37::illustration ::",
    );
    expect(result.totalAdjusted).toBe(14);
    expect(result.artistTagCount).toBe(8);
    expect(result.qualityTagCount).toBe(3);
    expect(result.otherTagCount).toBe(3);
    expect(result.output).not.toContain("artist:illustration");
    expect(result.output).not.toMatch(/(?:^|,\s*)::(?:,|$)/);
  });

  it("samples one-third to one-half independently for artist, quality, and content tags", () => {
    const values = [0, 0.5, 1];
    let cursor = 0;
    const result = repairV45ArtistWeightsForV5(
      "1.94::artist:xiujia_yihuizi ::, {{{best quality}}}, 2::official art ::",
      () => values[cursor++] ?? 1,
    );
    expect(result.output).toBe(
      "0.65::artist:xiujia_yihuizi ::, 0.48::best quality ::, 1::official art ::",
    );
    expect(result.totalAdjusted).toBe(3);
    expect(cursor).toBe(3);
  });

  it("normalizes all valid tags without applying the migration multiplier", () => {
    const result = normalizeV45ArtistSyntax(
      "(artist:foo:1.5), {artist:bar}, artist:baz, year 2025, {{illustration}}",
    );
    expect(result.output).toBe(
      "1.5::artist:foo ::, 1.05::artist:bar ::, 1::artist:baz ::, 1::year 2025 ::, 1.1::illustration ::",
    );
    expect(result.totalAdjusted).toBe(5);
    expect(result.artistTagCount).toBe(3);
  });

  it("applies a shared legacy scope to every contained tag, then repairs independently", () => {
    const values = [0, 1, 0.5];
    let cursor = 0;
    const result = repairV45ArtistWeightsForV5(
      "1.2::artist:foo, artist:bar, masterpiece ::",
      () => values[cursor++] ?? 0,
    );
    expect(result.output).toBe(
      "0.4::artist:foo ::, 0.6::artist:bar ::, 0.5::masterpiece ::",
    );
    expect(result.totalAdjusted).toBe(3);
    expect(cursor).toBe(3);
  });

  it("carries brace emphasis across comma-separated tags", () => {
    const result = normalizeV45ArtistSyntax("{{masterpiece, best quality}}, [no text]");
    expect(result.output).toBe(
      "1.1::masterpiece ::, 1.1::best quality ::, 0.95::no text ::",
    );
  });

  it("does not guess an unknown bare tag as an artist", () => {
    const result = repairV45ArtistWeightsForV5("unknown_creator, illustration", () => 0);
    expect(result.output).toBe(
      "0.33::unknown_creator ::, 0.33::illustration ::",
    );
    expect(result.artistTagCount).toBe(0);
    expect(result.totalAdjusted).toBe(2);
  });
});

describe("drawAllV5ArtistWeights", () => {
  it("uses the repair migration rule, constrains it to the draw range, and retains every tag", () => {
    const values = [0, 0.5, 1, 0.25];
    let cursor = 0;
    const recipes = drawAllV5ArtistWeights(
      "artist:foo, {{best quality}}, impasto, no halo",
      1,
      0.2,
      1.2,
      () => values[cursor++] ?? 0,
    );
    expect(recipes).toHaveLength(1);
    expect(recipes[0].prompt).toBe(
      "0.33::artist:foo ::, 0.46::best quality ::, 0.5::impasto ::, 0.38::no halo ::",
    );
    expect(recipes[0].artists).toEqual([{ name: "foo", weight: 0.33 }]);
    expect(recipes[0].auxiliary.map((tag) => tag.kind)).toEqual([
      "quality",
      "style",
      "negative",
    ]);
    expect(recipes[0].artists.length + recipes[0].auxiliary.length).toBe(4);
  });

  it("draws prompts that contain no artist tag instead of rejecting them", () => {
    const recipes = drawAllV5ArtistWeights(
      "{{best quality}}, illustration, 1girl",
      2,
      0.2,
      1.2,
      () => 0,
    );
    expect(recipes).toHaveLength(2);
    expect(recipes[0].artists).toEqual([]);
    expect(recipes[0].auxiliary).toHaveLength(3);
    expect(recipes[0].prompt).toBe(
      "0.37::best quality ::, 0.33::illustration ::, 0.33::1girl ::",
    );
  });

  it("preserves legacy relative weight before applying the final bounds", () => {
    const recipes = drawAllV5ArtistWeights(
      "2::artist:foo ::, 0.1::best quality ::, 10::impasto ::",
      1,
      0.2,
      1.2,
      () => 0,
    );
    expect(recipes[0].prompt).toBe(
      "0.67::artist:foo ::, 0.2::best quality ::, 1.2::impasto ::",
    );
  });

  it("creates the requested number of complete candidates", () => {
    let value = 0;
    const recipes = drawAllV5ArtistWeights(
      "artist:foo, best quality, 1girl",
      3,
      0.2,
      1.2,
      () => (value = (value + 0.17) % 1),
    );
    expect(recipes).toHaveLength(3);
    expect(new Set(recipes.map((recipe) => recipe.prompt)).size).toBe(3);
    for (const recipe of recipes) {
      expect(recipe.artists.length + recipe.auxiliary.length).toBe(3);
    }
  });

  it("reports the total number of retained tags", () => {
    expect(countV5PromptTags(MALFORMED_MIXED_PROMPT)).toBe(14);
    expect(countV5PromptTags("，，, ::, ;")).toBe(0);
  });
});

describe("repairV45ArtistCandidatesForV5", () => {
  it("creates several complete candidates using the same parser and migration as repair", () => {
    const samples = [0, 1, 0.25, 0.75];
    let cursor = 0;
    const candidates = repairV45ArtistCandidatesForV5(
      "xiaoluo_xl, 2::nonco ::",
      2,
      () => samples[cursor++] ?? 0,
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0].prompt).toBe(
      "0.33::artist:xiaoluo_xl ::, 1::artist:nonco ::",
    );
    expect(candidates[1].prompt).toBe(
      "0.38::artist:xiaoluo_xl ::, 0.92::artist:nonco ::",
    );
    expect(candidates.every((candidate) => candidate.artists.length === 2)).toBe(true);
  });
});
