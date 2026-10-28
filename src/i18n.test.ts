import { describe, expect, it } from "vitest";
import {
  desktopUiText,
  getChromeText,
  getGeneratePanelText,
  getLocalizedTabItems,
  getSettingsSectionText,
  getSettingsShellText,
  getTokenGuideText,
  getToolsHubText,
  normalizeAppLanguage,
} from "./i18n";
import {
  localizedTagLabel,
  TAB_ITEMS,
} from "./prompt-data";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStrings);
}

describe("desktop UI text", () => {
  it("uses the complete NovelAI API Token label for missing generation credentials", () => {
    expect(desktopUiText("zh-CN", "cost.configureToken")).toContain("NovelAI API Token");
  });

  it("resolves every stored or missing language value to Simplified Chinese", () => {
    for (const value of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "fr-FR", undefined]) {
      expect(normalizeAppLanguage(value)).toBe("zh-CN");
      expect(desktopUiText(value, "cost.loadImageFirst")).toBe(desktopUiText("zh-CN", "cost.loadImageFirst"));
    }
  });

  it("has text for every pre-run quote unavailable state", () => {
    const keys = [
      "cost.configureToken",
      "cost.loadImageFirst",
      "cost.invalidParams",
      "cost.imageTooLarge",
    ];
    for (const key of keys) {
      const value = desktopUiText("zh-CN", key);
      expect(value.trim()).not.toBe("");
      expect(value).not.toBe(key);
    }
  });

  it("has text for every generation phase shown on the canvas", () => {
    const keys = [
      "canvas.preparingTitle",
      "canvas.preparingHint",
      "canvas.requestingTitle",
      "canvas.requestingHint",
      "canvas.streamingTitle",
      "canvas.streamingProgress",
      "canvas.savingTitle",
      "canvas.savingHint",
    ];
    for (const key of keys) {
      const value = desktopUiText("zh-CN", key);
      expect(value.trim()).not.toBe("");
      expect(value).not.toBe(key);
    }
  });

  it("has complete labels for every main tab", () => {
    const baseValues = TAB_ITEMS.map((item) => item.value);
    expect(baseValues.indexOf("referencePresets")).toBe(
      baseValues.indexOf("tools") + 1,
    );
    const localized = getLocalizedTabItems("zh-CN");
    expect(localized.map((item) => item.value)).toEqual(baseValues);
    for (const item of localized) {
      expect(item.label.trim()).not.toBe("");
      expect(item.title.trim()).not.toBe("");
      expect(item.desc.trim()).not.toBe("");
    }
  });

  it("has complete chrome, tools-hub and settings text without a language section", () => {
    for (const value of Object.values(getChromeText("zh-CN"))) {
      expect(value.trim()).not.toBe("");
    }
    for (const value of Object.values(getToolsHubText("zh-CN"))) {
      expect(value.trim()).not.toBe("");
    }
    for (const value of collectStrings(getTokenGuideText("zh-CN"))) {
      expect(value.trim()).not.toBe("");
    }
    const settings = getSettingsShellText("zh-CN");
    expect(settings.title.trim()).not.toBe("");
    expect(Object.keys(settings.nav)).toEqual([
      "api",
      "storage",
      "backup",
      "ai-reverse",
      "convert-api",
      "templates",
      "prompt",
      "appearance",
      "performance",
      "about",
    ]);
    for (const value of Object.values(settings.nav)) {
      expect(value.trim()).not.toBe("");
    }
    const sections = getSettingsSectionText("zh-CN");
    expect(Object.keys(sections)).toEqual(["appearance", "performance"]);
    for (const group of Object.values(sections)) {
      for (const value of Object.values(group)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("has complete generation panel text", () => {
    const text = getGeneratePanelText("zh-CN");
    expect(Object.keys(text.modeSwitch)).toEqual(["textToImage", "imageToImage"]);
    for (const value of collectStrings(text)) {
      expect(value.trim()).not.toBe("");
    }
  });

  it("labels tags with the source description, then the built-in Chinese glossary, then the readable tag", () => {
    expect(localizedTagLabel("long_hair", " 自定义说明 ")).toBe("自定义说明");
    expect(localizedTagLabel("1girl")).toBe("一个女孩 / 单女性角色");
    expect(localizedTagLabel("unlisted_custom-tag")).toBe("unlisted custom tag");
  });
});
