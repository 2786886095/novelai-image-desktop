import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addArtistFavorite,
  loadArtistFavorites,
  removeArtistFavorite,
  replaceArtistFavorites,
  type SharedArtistFavorite,
} from "./artist-favorite-library";

function favorite(id: string): SharedArtistFavorite {
  return {
    id,
    pairId: id,
    variant: "plain",
    sequence: 1,
    status: "done",
    artists: [],
    auxiliary: [],
    mutations: [],
    franchiseStyles: [],
    basePrompt: "",
    prompt: `1::artist:${id} ::`,
  };
}

describe("artist favorite collections", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    vi.stubGlobal("CustomEvent", class {
      constructor(public type: string, public init?: unknown) {}
    });
  });

  it("restores and deduplicates random favorites from all historical sessions", () => {
    values.set("langbai.artist-lab.random.v6", JSON.stringify({ favorites: [] }));
    values.set("langbai.artist-lab.random.v5", JSON.stringify({ favorites: [favorite("old-a")] }));
    values.set("langbai.artist-lab.random.v4", JSON.stringify({ favorites: [favorite("old-a"), favorite("old-b")] }));

    expect(loadArtistFavorites("random").map((item) => item.id)).toEqual([
      "old-a",
      "old-b",
    ]);
    expect(values.has("langbai.artist-lab.random.favorites.v1")).toBe(true);

    removeArtistFavorite("random", "old-a");
    expect(loadArtistFavorites("random").map((item) => item.id)).toEqual(["old-b"]);
  });

  it("keeps random, repair, and input-draw favorites mutually independent", () => {
    replaceArtistFavorites("random", [favorite("random")]);
    addArtistFavorite("v5-repair", favorite("repair"));
    addArtistFavorite("artist-string-draw", favorite("draw"));

    expect(loadArtistFavorites("random").map((item) => item.id)).toEqual(["random"]);
    expect(loadArtistFavorites("v5-repair").map((item) => item.id)).toEqual(["repair"]);
    expect(loadArtistFavorites("artist-string-draw").map((item) => item.id)).toEqual(["draw"]);
  });
});
