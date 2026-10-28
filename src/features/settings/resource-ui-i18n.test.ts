import { describe, expect, it } from "vitest";
import { resourceDefinitionText, resourcePhaseText, resourceText } from "./resource-ui-i18n";

describe("resource settings text", () => {
  it("renders the Chinese labels and fills placeholders", () => {
    expect(resourceText("zh-CN", "title")).toBe("模型与资源库");
    expect(resourceText("zh-CN", "installed", { version: "2026.10", size: "12 MB" })).toBe("已安装 · 2026.10 · 12 MB");
    expect(resourcePhaseText("zh-CN", "complete")).toBe(resourceText("zh-CN", "complete"));
    expect(resourceDefinitionText("zh-CN", "tagCatalog").label).toBe("基础 Danbooru 标签目录");
  });
});
