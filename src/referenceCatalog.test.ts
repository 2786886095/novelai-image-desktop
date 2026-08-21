import { describe, expect, it } from "vitest";
import {
  catalogCategoryName,
  catalogGameName,
  catalogGroupName,
  catalogName,
  catalogSearchText,
  catalogSeriesMetrics,
  formatCatalogBytes,
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

describe("reference catalog localization", () => {
  it("uses the active app language for character, game and category labels", () => {
    expect(catalogName(asset, "zh-CN")).toBe("安柏");
    expect(catalogName(asset, "ja-JP")).toBe("アンバー");
    expect(catalogName(asset, "ko-KR")).toBe("엠버");
    expect(catalogName(asset, "en-US")).toBe("Amber");
    expect(catalogGameName(asset.game, "en-US", asset.gameNames)).toBe("Genshin Impact");
    expect(catalogCategoryName(asset.category, "zh-TW")).toBe("遊戲內角色圖");
    expect(catalogGroupName("原神 · 游戏内角色图", "ko-KR")).toBe("원신 · 인게임 캐릭터");
  });

  it("searches every locale and reports transfer size", () => {
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
