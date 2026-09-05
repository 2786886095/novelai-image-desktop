import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resourceText } from "./features/settings/resource-ui-i18n";
import { tavernUiText, type TavernUiKey } from "./tavern/ui-i18n";
import type { AppLanguage } from "./types";

const languages: AppLanguage[] = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

describe("cross-client UI localization coverage", () => {
  it("provides locale-specific Tavern AI copy for every supported locale", () => {
    const keys: TavernUiKey[] = ["openTavern", "directModel", "imageSettingsTitle", "autoDetect", "contextLength", "maxOutput"];
    for (const language of languages) {
      for (const key of keys) expect(tavernUiText(language, key).trim()).not.toBe("");
    }
    expect(tavernUiText("en-US", "autoDetect")).toMatch(/detect/i);
    expect(tavernUiText("ja-JP", "imageSettingsTitle")).toMatch(/[ぁ-んァ-ヶ]/);
    expect(tavernUiText("ko-KR", "directModel")).toMatch(/[가-힣]/);
    expect(tavernUiText("zh-TW", "contextLength")).toContain("長度");
  });

  it("localizes resource settings instead of rendering backend Chinese labels", () => {
    expect(resourceText("en-US", "title")).toBe("Models & resource libraries");
    expect(resourceText("ja-JP", "tagCatalog")).toMatch(/[ぁ-んァ-ヶ]/);
    expect(resourceText("ko-KR", "cacheTitle")).toMatch(/[가-힣]/);
    expect(resourceText("zh-TW", "confirmRestore")).toContain("還原");
  });

  it("keeps localized calls at the formerly mixed-language desktop surfaces", () => {
    const files = [
      "src/AgentPage.tsx",
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
