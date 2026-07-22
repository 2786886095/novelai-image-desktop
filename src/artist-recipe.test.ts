import { describe, expect, it } from "vitest";
import { generatePopularArtistRecipes, parseArtistRecipe } from "./artist-recipe";
import type { ArtistTagRecord } from "./artist-lab";

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
    expect(recipes.some((recipe) => recipe.artists.some((artist) => artist.weight > 1.2))).toBe(true);
  });

  it("only mutates auxiliary content when explicitly enabled", () => {
    const locked = generatePopularArtistRecipes(pool, {
      count: 1,
      minArtists: 5,
      maxArtists: 5,
      mutateAuxiliary: false,
      auxiliaryPrompt: "year 2025, impasto, no halo",
      random: seeded(),
    })[0];
    expect(locked.auxiliary.map((token) => token.value)).toEqual(["year 2025", "impasto", "no halo"]);
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
});
