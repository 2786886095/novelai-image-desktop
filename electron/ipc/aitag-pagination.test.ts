import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));
vi.mock("./aitag-cache", () => ({ cacheAitagImage: vi.fn() }));

import { clearAitagDataCache, searchAitagFresh } from "./aitag";

beforeEach(() => {
  clearAitagDataCache();
  axiosGet.mockReset();
});

describe("AITag client pagination adapter", () => {
  it("requests the API minimum of 60 and returns a 12-item client page", async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: {
        page: 1,
        page_size: 60,
        total: 120,
        items: Array.from({ length: 60 }, (_, index) => ({ id: index + 1 })),
      },
    });

    const result = await searchAitagFresh({ page: 2, pageSize: 12, sort: "new", timeRange: "all" }) as {
      page: number;
      page_size: number;
      total: number;
      items: Array<{ id: number }>;
    };

    expect(axiosGet).toHaveBeenCalledWith(
      "https://aitag.win/api/ai_works_search",
      expect.objectContaining({ params: expect.objectContaining({ page: 1, page_size: 60 }) }),
    );
    expect(result).toMatchObject({ page: 2, page_size: 12, total: 120 });
    expect(result.items.map((item) => item.id)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  });

  it("stitches adjacent API pages when a client page crosses a 60-item boundary", async () => {
    axiosGet.mockImplementation(async (_url: string, config: { params: { page: number } }) => {
      const start = (config.params.page - 1) * 60;
      return {
        status: 200,
        data: {
          page: config.params.page,
          page_size: 60,
          total: 180,
          items: Array.from({ length: 60 }, (_, index) => ({ id: start + index + 1 })),
        },
      };
    });

    const result = await searchAitagFresh({ page: 2, pageSize: 48, sort: "new", timeRange: "all" }) as {
      items: Array<{ id: number }>;
    };

    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(48);
    expect(result.items[0].id).toBe(49);
    expect(result.items.at(-1)?.id).toBe(96);
  });
});
