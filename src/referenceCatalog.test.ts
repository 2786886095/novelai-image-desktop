import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogCategoryName,
  catalogGameName,
  catalogGroupName,
  catalogName,
  catalogSearchText,
  catalogSeriesMetrics,
  formatCatalogBytes,
  loadReferenceCatalog,
  type ReferenceCatalogAsset,
} from "./referenceCatalog";

const asset: ReferenceCatalogAsset = {
  id: "genshin/amber/default",
  game: "原神",
  category: "游戏内角色图",
  roleId: "amber",
  names: {
    "zh-CN": "安柏",
    "zh-TW": "安柏",
    "ja-JP": "アンバー",
    "ko-KR": "엠버",
    "en-US": "Amber",
  },
  gameNames: {
    "zh-CN": "原神",
    "zh-TW": "原神",
    "ja-JP": "原神",
    "ko-KR": "원신",
    "en-US": "Genshin Impact",
  },
  searchAliases: ["Outrider", "侦察骑士"],
  width: 1024,
  height: 1536,
  bytes: 1536 * 1024,
  downloadUrl: "https://example.test/amber.png",
};

describe("reference catalog labels", () => {
  it("shows the Chinese character, game and category labels", () => {
    expect(catalogName(asset, "zh-CN")).toBe("安柏");
    expect(catalogName(asset, undefined)).toBe("安柏");
    expect(catalogGameName(asset.game, "zh-CN", asset.gameNames)).toBe("原神");
    expect(catalogGameName("妮姬", undefined)).toBe("胜利女神：妮姬");
    expect(catalogCategoryName(asset.category, "zh-CN")).toBe("游戏内角色图");
    expect(catalogGroupName("崩坏三 · 角色立绘", "zh-CN")).toBe("崩坏3 · 角色立绘");
  });

  it("searches every catalog locale and reports transfer size", () => {
    const search = catalogSearchText(asset);
    expect(search).toContain("amber");
    expect(search).toContain("侦察骑士");
    expect(search).toContain("원신");
    expect(formatCatalogBytes(asset.bytes)).toBe("1.5 MB");
  });

  it("summarizes a whole series without counting saved assets twice", () => {
    const second = { ...asset, id: "genshin/amber/alternate", bytes: 512 * 1024 };
    expect(catalogSeriesMetrics([asset, second], new Set([asset.id]))).toEqual({
      totalCount: 2,
      downloadedCount: 1,
      pendingCount: 1,
      totalBytes: 2 * 1024 * 1024,
      pendingBytes: 512 * 1024,
    });
  });
});


describe('retired thumbnail mirrors', () => {
  it('never falls back to a Gitee URL from an old catalog', async () => {
    const {catalogThumbnailUrls} = await import('./referenceCatalog');
    const asset = {thumbnailMirrors: {github: 'https://raw.githubusercontent.com/a/b/main/thumb.png'}, downloadMirrors: {github: 'https://example.com/full.png'}, thumbnailUrl: 'https://GITEE.com/old.png', downloadUrl: 'https://sub.gitee.com/old.png'} as Parameters<typeof catalogThumbnailUrls>[0];
    expect(catalogThumbnailUrls(asset)).toEqual(['https://raw.githubusercontent.com/a/b/main/thumb.png', 'https://example.com/full.png']);
    expect(catalogThumbnailUrls({...asset, thumbnailMirrors: {}, downloadMirrors: {}})).toEqual([]);
  });
});

describe("bundled catalog fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["packaged app", "file:///C:/Program%20Files/Langbai/resources/app.asar/dist/index.html", "file:///C:/Program%20Files/Langbai/resources/app.asar/dist/"],
    ["dev server", "http://127.0.0.1:5173/", "http://127.0.0.1:5173/"],
  ])("loads the copy next to the page (%s) when the hosted catalogs fail", async (_label, baseURI, root) => {
    const bundled = `${root}reference-catalog/index.json`;
    const requested: string[] = [];
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.stubGlobal("document", { baseURI });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      requested.push(String(input));
      if (String(input) !== bundled) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({
        schema: "langbai-reference-catalog/v1",
        generatedAt: "2026-10-01T00:00:00.000Z",
        provider: "bundled",
        assets: [{ ...asset, downloadUrl: "assets/amber.png", thumbnailUrl: "https://example.test/amber-thumb.png" }],
      }));
    }));
    const catalog = await loadReferenceCatalog(undefined, true);
    expect(requested.at(-1)).toBe(bundled);
    expect(requested.slice(0, -1).length).toBeGreaterThan(0);
    expect(catalog.assets[0].downloadUrl).toBe(`${root}reference-catalog/assets/amber.png`);
    expect(catalog.assets[0].thumbnailUrl).toBe("https://example.test/amber-thumb.png");
  });
});
