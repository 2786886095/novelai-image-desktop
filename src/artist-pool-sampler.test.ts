import { expect, it } from "vitest";
import { generatePopularArtistRecipes } from "./artist-recipe";
import { createArtistLabRandom } from "./artist-lab";
const options = { count: 8, minArtists: 3, maxArtists: 7, mutateAuxiliary: false, auxiliaryPrompt: "" };
it("supports a full 600000-entry pool without per-selection full scans", () => {
  const pool = Array.from({ length: 600000 }, (_, i) => ({ id: i + 1, name: `artist_${i + 1}`, postCount: i % 10000, deprecated: false }));
  const start = performance.now();
  const results = generatePopularArtistRecipes(pool, { ...options, random: createArtistLabRandom(123) });
  const elapsed = performance.now() - start;
  expect(results).toHaveLength(8); expect(results.every(r => new Set(r.artists.map(a => a.name)).size === r.artists.length)).toBe(true);
  expect(elapsed).toBeLessThan(5000);
  process.stdout.write(`FULL_POOL_SAMPLER: candidates=600000; recipes=8; milliseconds=${Math.round(elapsed)}\n`);
});
it("the end of the full pool remains reachable without replacement", () => {
  const pool = Array.from({ length: 6005 }, (_, i) => ({ id: i + 1, name: `artist_${i + 1}`, postCount: 1, deprecated: false }));
  const [r] = generatePopularArtistRecipes(pool, { ...options, count: 1, minArtists: 20, maxArtists: 20, random: () => 1 - Number.EPSILON });
  expect(r.artists).toHaveLength(20); expect(new Set(r.artists.map(a => a.name)).size).toBe(20); expect(r.artists.some(a => a.name === "artist_6005")).toBe(true);
});
