import { describe, expect, it } from "vitest";
import {
  FRANCHISE_STYLE_LIBRARY,
  canonicalArtistTagName,
  ensureTrailingPromptComma,
  expandArtistRecipeComparisons,
  formatArtistCardTags,
  formatArtistFullPrompt,
  formatArtistString,
  generateArtistMatchRecipes,
  generatePopularArtistRecipes,
  parseArtistRecipe,
  randomizeArtistRecipeWeights,
} from "./artist-recipe";
import type { ArtistTagRecord } from "./artist-lab";
import { RANDOM_CUSTOM_TAG_LIBRARY } from "./random-custom-tag-library";

const pool: ArtistTagRecord[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  name: `artist_${index + 1}`,
  postCount: 30_000 - index * 700,
  deprecated: false,
}));

function seeded() {
  let value = 0.137;
  return () => (value = (value * 7.13 + 0.173) % 1);
}

describe("artist recipe grammar", () => {
  it("keeps the complete general-quality group first in the shared visual-style library", () => {
    const quality = RANDOM_CUSTOM_TAG_LIBRARY[0];
    expect(quality.id).toBe("quality");
    expect(quality.tags.map((entry) => entry.tag)).toEqual(expect.arrayContaining([
      "masterpiece",
      "top aesthetic",
      "best quality",
      "great quality",
      "high complexity",
      "year 2026",
      "year 1980",
    ]));
  });
  it("parses full-width punctuation, bracket emphasis, and numerical emphasis", () => {
    const tokens = parseArtistRecipe("{{artist:foo，bar}}, 0.4::impasto ::，-2::no halo ::");
    expect(tokens.map((token) => token.value)).toEqual(["artist:foo", "bar", "impasto", "no halo"]);
    expect(tokens[0].weight).toBeGreaterThan(1);
    expect(tokens[2]).toMatchObject({ weight: 0.4, kind: "style" });
    expect(tokens[3]).toMatchObject({ weight: -2, kind: "negative" });
  });

  it("protects every token inside a numerical negative-emphasis segment", () => {
    const tokens = parseArtistRecipe("-3::artist collaboration, text, variations::");
    expect(tokens.map((token) => [token.value, token.weight, token.kind])).toEqual([
      ["artist collaboration", -3, "negative"],
      ["text", -3, "negative"],
      ["variations", -3, "negative"],
    ]);
  });

  it("builds deterministic multi-level recipes from a popularity pool", () => {
    const recipes = generatePopularArtistRecipes(pool, {
      count: 8,
      minArtists: 4,
      maxArtists: 10,
      mutateAuxiliary: false,
      auxiliaryPrompt: "year 2025, masterpiece",
      random: seeded(),
    });
    expect(recipes).toHaveLength(8);
    expect(new Set(recipes.map((recipe) => recipe.prompt)).size).toBe(8);
    expect(recipes.every((recipe) => recipe.artists.length >= 4 && recipe.artists.length <= 10)).toBe(true);
    expect(recipes.every((recipe) => recipe.prompt.includes("year 2025, masterpiece"))).toBe(true);
    expect(recipes.some((recipe) => recipe.artists.some((artist) => artist.weight < 0.65))).toBe(true);
    expect(recipes.some((recipe) => recipe.artists.some((artist) => artist.weight > 1))).toBe(true);
    expect(recipes.every((recipe) => recipe.artists.every((artist) => artist.weight <= 1.2))).toBe(true);
  });

  it("searches target styles from single artists into bounded elite mutations", () => {
    const first = generateArtistMatchRecipes(pool, {
      count: 6,
      round: 1,
      random: seeded(),
    });
    expect(first).toHaveLength(6);
    expect(first.every((recipe) => recipe.artists.length === 1)).toBe(true);

    const second = generateArtistMatchRecipes(pool, {
      count: 8,
      round: 2,
      eliteArtists: [first[0].artists, first[1].artists],
      seenPrompts: new Set(first.map((recipe) => recipe.prompt)),
      random: seeded(),
    });
    expect(second).toHaveLength(8);
    expect(second.every((recipe) => recipe.artists.length <= 4)).toBe(true);
    expect(second.filter((recipe) => recipe.move === "probe")).toHaveLength(2);
    expect(second.some((recipe) => recipe.move === "weight")).toBe(true);
    expect(second.some((recipe) => recipe.move === "expand")).toBe(true);
    expect(second.some((recipe) => recipe.artists.length > 1)).toBe(true);
    expect(second.every((recipe) => !first.some((item) => item.prompt === recipe.prompt))).toBe(true);
  });

  it("normalizes qualified Danbooru names and prefixes every generated artist tag", () => {
    const recipes = generatePopularArtistRecipes([
      { id: 1, name: "gochisousama (tanin050)", postCount: 200, deprecated: false },
      { id: 2, name: "asanagi", postCount: 100, deprecated: false },
    ], {
      count: 1,
      minArtists: 2,
      maxArtists: 2,
      mutateAuxiliary: false,
      random: seeded(),
    });
    expect(canonicalArtistTagName("gochisousama (tanin050)")).toBe("gochisousama_(tanin050)");
    expect(recipes[0].basePrompt).toContain("artist:gochisousama_(tanin050)");
    expect(recipes[0].basePrompt).toContain("artist:asanagi");
  });

  it("honors configurable artist weight bounds, including reversed input", () => {
    const recipes = generatePopularArtistRecipes(pool, {
      count: 20,
      minArtists: 7,
      maxArtists: 3,
      artistWeightMin: 2,
      artistWeightMax: 0.3,
      mutateAuxiliary: false,
      random: seeded(),
    });
    expect(recipes.every((recipe) => recipe.artists.length >= 3 && recipe.artists.length <= 7)).toBe(true);
    expect(recipes.flatMap((recipe) => recipe.artists).every((artist) => artist.weight >= 0.3 && artist.weight <= 2)).toBe(true);
  });

  it("adds distinct optional game/anime copyright tags with configurable count and weights", () => {
    expect(FRANCHISE_STYLE_LIBRARY).toHaveLength(30);
    expect(new Set(FRANCHISE_STYLE_LIBRARY).size).toBe(30);
    const recipes = generatePopularArtistRecipes(pool, {
      count: 20,
      minArtists: 3,
      maxArtists: 7,
      artistWeightMin: 0.3,
      artistWeightMax: 2,
      mutateAuxiliary: false,
      includeFranchiseStyles: true,
      minFranchiseStyles: 0,
      maxFranchiseStyles: 2,
      franchiseWeightMin: 0.5,
      franchiseWeightMax: 1.5,
      random: seeded(),
    });
    expect(recipes.every((recipe) => recipe.franchiseStyles.length <= 2)).toBe(true);
    expect(recipes.some((recipe) => recipe.franchiseStyles.length > 0)).toBe(true);
    expect(recipes.every((recipe) => new Set(recipe.franchiseStyles.map((tag) => tag.value)).size === recipe.franchiseStyles.length)).toBe(true);
    expect(recipes.flatMap((recipe) => recipe.franchiseStyles).every((tag) => tag.weight >= 0.5 && tag.weight <= 1.5)).toBe(true);
    for (const recipe of recipes) {
      for (const tag of recipe.franchiseStyles) expect(recipe.basePrompt).toContain(tag.value);
    }
  });

  it("keeps user auxiliary terms fixed and draws labelled style mutations only when enabled", () => {
    const locked = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: false,
      auxiliaryPrompt: "year 2025, impasto, no halo",
      random: seeded(),
    })[0];
    expect(locked.auxiliary.map((token) => token.value)).toEqual(["year 2025", "impasto", "no halo"]);
    expect(locked.mutations).toEqual([]);
    expect(locked.basePrompt).toBe(locked.prompt);

    const mutated = generatePopularArtistRecipes(pool, {
      count: 8,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: true,
      auxiliaryPrompt: "year 2025, impasto",
      random: seeded(),
    });
    expect(mutated.every((recipe) => recipe.auxiliary.map((token) => token.value).join(",") === "year 2025,impasto")).toBe(true);
    expect(mutated.every((recipe) => recipe.mutations.length >= 2 && recipe.mutations.length <= 6)).toBe(true);
    expect(mutated.flatMap((recipe) => recipe.mutations).every((token) => token.weight >= 0.3 && token.weight <= 1.5)).toBe(true);
    expect(mutated.flatMap((recipe) => recipe.mutations).every((token) => Boolean(token.category))).toBe(true);
    expect(mutated.every((recipe) => !recipe.basePrompt.includes(recipe.mutations[0].value))).toBe(true);
  });

  it("expands mutation draws into fair plain/mutated A-B comparisons", () => {
    const recipe = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: true,
      auxiliaryPrompt: "year 2025",
      random: seeded(),
    })[0];
    const pair = expandArtistRecipeComparisons([recipe], true);
    expect(pair).toHaveLength(2);
    expect(pair.map((item) => item.variant)).toEqual(["plain", "mutated"]);
    expect(pair[0].pairId).toBe(pair[1].pairId);
    expect(pair[0].artists).toEqual(pair[1].artists);
    expect(pair[0].prompt).toBe(recipe.basePrompt);
    expect(pair[0].mutations).toEqual([]);
    expect(pair[0].franchiseStyles).toEqual(recipe.franchiseStyles);
    expect(pair[1].prompt).toBe(recipe.prompt);
    expect(pair[1].mutations).toEqual(recipe.mutations);
  });

  it("reuses favorite style categories and weights only when mutation is enabled", () => {
    const favorite = {
      raw: "cinematic lighting",
      value: "cinematic lighting",
      weight: 1.4,
      kind: "style" as const,
      category: "lighting" as const,
    };
    const biased = generatePopularArtistRecipes(pool, {
      count: 40,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: true,
      favoriteMutations: [favorite],
      random: seeded(),
    });
    expect(biased.flatMap((recipe) => recipe.mutations).some((token) => (
      token.category === favorite.category
      && token.value === favorite.value
      && token.weight === favorite.weight
    ))).toBe(true);

    const disabled = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: false,
      favoriteMutations: [favorite],
      random: seeded(),
    })[0];
    expect(disabled.mutations).toEqual([]);
  });

  it("caps each string at twenty artists", () => {
    const recipe = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 50,
      maxArtists: 50,
      mutateAuxiliary: false,
      random: seeded(),
    })[0];
    expect(recipe.artists).toHaveLength(20);
  });

  it("does not impose the former one-hundred recipe ceiling", () => {
    const recipes = generatePopularArtistRecipes(pool, {
      count: 137,
      minArtists: 4,
      maxArtists: 10,
      mutateAuxiliary: false,
      random: seeded(),
    });
    expect(recipes).toHaveLength(137);
    expect(new Set(recipes.map((recipe) => recipe.prompt)).size).toBe(137);
  });

  it("copies artist strings with a trailing comma and builds the full prompt in the requested order", () => {
    const recipe = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 2,
      maxArtists: 2,
      auxiliaryPrompt: "year 2025",
      mutateAuxiliary: true,
      random: seeded(),
    })[0];
    const artistString = formatArtistString(recipe.artists);
    const full = formatArtistFullPrompt(recipe, "1girl, smile");
    expect(artistString.endsWith(",")).toBe(true);
    expect(full.startsWith(artistString)).toBe(true);
    expect(full.startsWith(`${recipe.prompt},`)).toBe(true);
    expect(full.endsWith("1girl, smile,")).toBe(true);
    expect(full).not.toMatch(/,,+$/);
  });

  it("copies every weighted tag displayed on the result card", () => {
    const prompt = [
      "1.94::artist:xiujia_yihuizi ::",
      "1.01::artist:asteroid_ill ::",
      "1.17::zenless_zone_zero ::",
      "1.36::arknights ::",
      "0.8::cinematic lighting ::",
    ].join(", ");
    const copied = formatArtistCardTags({ prompt });
    expect(copied).toBe(`${prompt},`);
    expect(copied).toContain("zenless_zone_zero");
    expect(copied).toContain("arknights");
    expect(copied).toContain("cinematic lighting");
    expect(formatArtistCardTags({ prompt: `${prompt},,` })).toBe(`${prompt},`);
  });

  it("normalizes both artist-string and full-prompt copies to one trailing comma", () => {
    const recipe = {
      artists: [{ name: "foo", weight: 0.4 }],
      auxiliary: [],
      mutations: [],
      franchiseStyles: [],
      prompt: "0.4::artist:foo ::,,",
    };
    expect(formatArtistCardTags(recipe)).toBe("0.4::artist:foo ::,");
    expect(formatArtistFullPrompt(recipe, "1girl,,")).toBe("0.4::artist:foo ::, 1girl,");
    expect(ensureTrailingPromptComma("0.4::artist:foo ::，，")).toBe("0.4::artist:foo ::,");
  });

  it("keeps artist order while randomizing only weights around the originals", () => {
    const values = [0, 1, 0.25, 0.75];
    let index = 0;
    const recipes = randomizeArtistRecipeWeights(
      "1::artist:foo ::, 2::artist:bar ::,",
      2,
      20,
      () => values[index++],
    );
    expect(recipes).toHaveLength(2);
    expect(recipes.every((recipe) => recipe.artists.map((artist) => artist.name).join(",") === "foo,bar")).toBe(true);
    expect(recipes[0].artists.map((artist) => artist.weight)).toEqual([0.8, 2.4]);
    expect(recipes[1].artists.map((artist) => artist.weight)).toEqual([0.9, 2.2]);
    expect(randomizeArtistRecipeWeights("masterpiece, 1girl", 3)).toEqual([]);
  });

  it("adds selected quality and style tags to every tuned artist string with fresh weights", () => {
    const recipes = randomizeArtistRecipeWeights(
      "1::artist:foo ::, 2::artist:bar ::,",
      2,
      0,
      () => 0.5,
      {
        customTagPool: "masterpiece, year 2026, cinematic lighting",
        customTagModes: { "cinematic lighting": "random" },
        minRandomCustomTags: 1,
        maxRandomCustomTags: 1,
        customTagWeightMin: 0.4,
        customTagWeightMax: 0.8,
      },
    );
    expect(recipes).toHaveLength(2);
    expect(recipes.every((recipe) => recipe.prompt.includes("0.6::masterpiece ::"))).toBe(true);
    expect(recipes.every((recipe) => recipe.prompt.includes("0.6::year 2026 ::"))).toBe(true);
    expect(recipes.every((recipe) => recipe.prompt.includes("0.6::cinematic lighting ::"))).toBe(true);
    expect(recipes.every((recipe) => recipe.auxiliary.length === 3)).toBe(true);
  });

  it("normalizes known artist aliases before copying or tuning weights", () => {
    expect(canonicalArtistTagName(" Channel_(_Caststation) ")).toBe("channel_(caststation)");
    expect(canonicalArtistTagName("machi_(7769)")).toBe("machi_(machi0910)");
    const recipe = randomizeArtistRecipeWeights("1::artist:channel_(_caststation) ::", 1)[0];
    expect(recipe.artists[0].name).toBe("channel_(caststation)");
    expect(formatArtistString([{ name: "Machi_(7769)", weight: 1 }]))
      .toContain("artist:machi_(machi0910)");
  });
});
