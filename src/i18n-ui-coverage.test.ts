import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resourceText } from "./features/settings/resource-ui-i18n";

describe("cross-client UI localization coverage", () => {
  it("localizes resource settings instead of rendering backend Chinese labels", () => {
    expect(resourceText("en-US", "title")).toBe("Models & resource libraries");
    expect(resourceText("ja-JP", "tagCatalog")).toMatch(/[ぁ-んァ-ヶ]/);
    expect(resourceText("ko-KR", "cacheTitle")).toMatch(/[가-힣]/);
    expect(resourceText("zh-TW", "confirmRestore")).toContain("還原");
  });

  it("keeps localized calls at the formerly mixed-language desktop surfaces", () => {
    const files = [
      "src/AitagGallery.tsx",
      "src/features/settings/ResourceDatabaseSettings.tsx",
      "src/components/AppErrorBoundary.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain(">暂无可用参考图<");
      expect(source).not.toContain(">正在读取资源状态…<");
      expect(source).not.toContain("当前来源：${info.label}");
    }
  });
});
