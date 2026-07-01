import { describe, expect, it } from "vitest";
import {
  getChromeText,
  getGeneratePanelText,
  getLocalizedTabItems,
  getSettingsSectionText,
  getSettingsShellText,
  getTokenGuideText,
  getToolsHubText,
  getTuiwenStudioText,
  normalizeAppLanguage,
  SUPPORTED_APP_LANGUAGES,
} from "./i18n";
import {
  CAPSULE_TAXONOMY,
  localizedCapsuleSubgroupName,
  localizedTagLabel,
  TAB_ITEMS,
} from "./prompt-data";

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStrings);
}

describe("desktop i18n resources", () => {
  it("supports the requested Simplified, Traditional, English, Japanese, and Korean locales", () => {
    expect(SUPPORTED_APP_LANGUAGES.map((item) => item.code)).toEqual(["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]);
  });

  it("normalizes unknown language codes to Simplified Chinese", () => {
    expect(normalizeAppLanguage("zh-TW")).toBe("zh-TW");
    expect(normalizeAppLanguage("fr-FR")).toBe("zh-CN");
    expect(normalizeAppLanguage(undefined)).toBe("zh-CN");
  });

  it("has complete localized labels for every main tab in every locale", () => {
    const baseValues = TAB_ITEMS.map((item) => item.value);
    for (const language of SUPPORTED_APP_LANGUAGES) {
      const localized = getLocalizedTabItems(language.code);
      expect(localized.map((item) => item.value)).toEqual(baseValues);
      for (const item of localized) {
        expect(item.label.trim()).not.toBe("");
        expect(item.title.trim()).not.toBe("");
        expect(item.desc.trim()).not.toBe("");
      }
    }
  });

  it("has complete localized chrome and tools-hub text for every locale", () => {
    for (const language of SUPPORTED_APP_LANGUAGES) {
      for (const value of Object.values(getChromeText(language.code))) {
        expect(value.trim()).not.toBe("");
      }
      for (const value of Object.values(getToolsHubText(language.code))) {
        expect(value.trim()).not.toBe("");
      }
      for (const value of collectStrings(getTokenGuideText(language.code))) {
        expect(value.trim()).not.toBe("");
      }
      const settings = getSettingsShellText(language.code);
      expect(settings.title.trim()).not.toBe("");
      expect(Object.keys(settings.nav)).toEqual([
        "api",
        "storage",
        "ai-reverse",
        "convert-api",
        "templates",
        "prompt",
        "language",
        "appearance",
        "performance",
        "about",
      ]);
      for (const value of Object.values(settings.nav)) {
        expect(value.trim()).not.toBe("");
      }
      for (const group of Object.values(getSettingsSectionText(language.code))) {
        for (const value of Object.values(group)) {
          expect(value.trim()).not.toBe("");
        }
      }
    }
  });

  it("has complete localized novel-shorts shell and import-stage text for every locale", () => {
    const stepKeys = ["import", "storyboard", "references", "generate", "audio", "motion", "export"];
    const aspectKeys = ["9:16", "16:9", "1:1", "4:3", "3:4"];
    for (const language of SUPPORTED_APP_LANGUAGES) {
      const text = getTuiwenStudioText(language.code);
      expect(Object.keys(text.steps)).toEqual(stepKeys);
      expect(Object.keys(text.importStage.aspectLabels)).toEqual(aspectKeys);
      for (const value of collectStrings(text)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("has complete localized generation panel text for every locale", () => {
    for (const language of SUPPORTED_APP_LANGUAGES) {
      const text = getGeneratePanelText(language.code);
      expect(Object.keys(text.modeSwitch)).toEqual(["textToImage", "imageToImage"]);
      for (const value of collectStrings(text)) {
        expect(value.trim()).not.toBe("");
      }
    }
  });

  it("provides non-Chinese fallback labels for every capsule tag in non-Chinese locales", () => {
    const capsuleTags = CAPSULE_TAXONOMY.flatMap((category) =>
      category.subgroups.flatMap((subgroup) => subgroup.tags)
    );
    expect(capsuleTags.length).toBeGreaterThan(4000);
    for (const tag of capsuleTags) {
      expect(localizedTagLabel(tag.en, tag.zh, "en-US")).not.toMatch(/\p{Script=Han}/u);
      if (/\p{Script=Han}/u.test(tag.zh)) {
        expect(localizedTagLabel(tag.en, tag.zh, "ja-JP").trim()).not.toBe("");
        expect(localizedTagLabel(tag.en, tag.zh, "ko-KR")).not.toBe(tag.zh);
      }
    }
    expect(localizedCapsuleSubgroupName("脸颊嘴部", "en-US")).not.toMatch(/\p{Script=Han}/u);
  });
});
