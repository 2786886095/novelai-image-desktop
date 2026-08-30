import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addArtistFavorite,
  hydrateArtistFavoriteLibrary,
  loadArtistFavorites,
  mergeArtistFavorites,
  recoverRandomArtistFavoritesFromHistory,
  removeArtistFavorite,
  replaceArtistFavorites,
  type SharedArtistFavorite,
} from "./artist-favorite-library";
import { DEFAULT_PARAMS, type HistoryItem } from "./types";

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

function historyFavorite(id: string, stylePrompt: string): HistoryItem {
  return {
    id,
    filePath: `C:/images/${id}.png`,
    fileUrl: `localmedia:///${id}.png`,
    date: "2026-08-30",
    createdAt: "2026-08-30T00:00:00.000Z",
    params: { ...DEFAULT_PARAMS, stylePrompt },
    actualSeed: 123,
    model: "nai-diffusion-5-full",
    width: 832,
    height: 1216,
    feature: "artist-lab",
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

  it("rebuilds missing random favorites from promoted image history", () => {
    const alreadyPresent = {
      ...favorite("existing"),
      image: historyFavorite("image-a", "0.4::artist:existing ::,"),
    };
    const recovered = recoverRandomArtistFavoritesFromHistory([
      alreadyPresent.image,
      historyFavorite("image-b", "0.43::artist:xiaoluo_xl ::, 0.7::artist:beijuu ::,"),
    ], [alreadyPresent]);

    expect(recovered).toHaveLength(2);
    expect(recovered[1].image?.id).toBe("image-b");
    expect(recovered[1].artists).toEqual([
      { name: "xiaoluo_xl", weight: 0.43 },
      { name: "beijuu", weight: 0.7 },
    ]);
    expect(recovered[1].prompt.endsWith(",")).toBe(true);
  });

  it("deduplicates the same saved image even when recipe ids changed", () => {
    const image = historyFavorite("same-image", "0.5::artist:foo ::,");
    const first = { ...favorite("old-id"), image };
    const second = { ...favorite("new-id"), image };
    expect(mergeArtistFavorites([first], [second])).toEqual([first]);
  });

  it("hydrates the union of local, filesystem, and promoted-history copies", async () => {
    values.set("langbai.artist-lab.random.favorites.v1", "[]");
    const save = vi.fn().mockResolvedValue({ ok: true });
    (window as any).naiDesktop = {
      artistLabLoadFavoriteLibrary: vi.fn().mockResolvedValue({
        version: 1,
        updatedAt: "2026-08-30T00:00:00.000Z",
        collections: {
          random: [favorite("disk-random")],
          "v5-repair": [favorite("disk-repair")],
          "artist-string-draw": [favorite("disk-draw")],
        },
      }),
      artistLabListPromotedFavorites: vi.fn().mockResolvedValue([
        historyFavorite("history-image", "0.8::artist:history_artist ::,"),
      ]),
      artistLabSaveFavoriteCollection: save,
    };

    await hydrateArtistFavoriteLibrary();

    expect(loadArtistFavorites("random").map((item) => item.id)).toEqual([
      "disk-random",
      "history-history-image",
    ]);
    expect(loadArtistFavorites("v5-repair").map((item) => item.id)).toEqual(["disk-repair"]);
    expect(loadArtistFavorites("artist-string-draw").map((item) => item.id)).toEqual(["disk-draw"]);
    expect(save).toHaveBeenCalledTimes(3);
  });
});
