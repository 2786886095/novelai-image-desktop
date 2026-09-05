import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() },
  dialog: { showOpenDialog: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ getSize: () => ({ width: 1, height: 1 }) })) },
}));
vi.mock("./local-media-protocol", () => ({ toLocalMediaUrl: (value: string) => value }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));

import { loadPopularArtistRanking } from "./artist-lab";

function artists(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    name: `artist_${start + index}`,
    post_count: 10_000 - start - index,
    category: 1,
    is_deprecated: false,
  }));
}

beforeEach(() => {
  axiosGet.mockReset();
  axiosGet.mockImplementation(async (_url: string, config: { params?: Record<string, unknown> }) => {
    const page = Number(config.params?.page ?? 1);
    if (page === 1) return { data: artists(1, 1000) };
    if (page === 2) return { data: artists(1001, 5) };
    return { data: [] };
  });
});

describe("complete Danbooru artist ranking pagination", () => {
  it("counts the full active list and stitches a UI page across API windows", async () => {
    const result = await loadPopularArtistRanking(84, 12, "", true);

    expect(result).toMatchObject({
      page: 84,
      pageSize: 12,
      total: 1005,
      hasMore: false,
      query: "",
    });
    expect(result.items).toHaveLength(9);
    expect(result.items[0]).toMatchObject({ id: 997, name: "artist_997" });
    expect(result.items.at(-1)).toMatchObject({ id: 1005, name: "artist_1005" });
    expect(axiosGet).toHaveBeenCalledWith(
      "https://danbooru.donmai.us/tags.json",
      expect.objectContaining({
        params: expect.objectContaining({
          limit: 1000,
          "search[category]": 1,
          "search[is_deprecated]": "no",
        }),
      }),
    );
  });
});
