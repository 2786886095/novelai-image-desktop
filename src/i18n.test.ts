import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { localizedStoreText } from "./store-i18n";
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

  it("has text for every literal key the screens pass to the translation helpers", () => {
    // t()/f() are desktopUiText/desktopUiFormat wrappers; storeText()/storeFormat() read the store catalog.
    const call = (names: string) => new RegExp(`\\b(?:${names})\\([^,()]*(?:\\([^()]*\\))?[^,()]*,\\s*["']([^"']+)["']`, "g");
    const missing: string[] = [];
    const files = fs.readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
    for (const file of files) {
      const source = fs.readFileSync(path.join("src", file), "utf8");
      const desktop = [...source.matchAll(call("desktopUiText|desktopUiFormat"))];
      if (/\b[tf]\s*[:=]\s*(?:useCallback\()?\(key: string/.test(source)) desktop.push(...source.matchAll(/(?<![\w.$])[tf]\(\s*["']([^"']+)["']/g));
      for (const [, key] of desktop) if (desktopUiText("zh-CN", key) === key) missing.push(`${file}: ${key}`);
      for (const [, key] of source.matchAll(call("storeText|storeFormat|localizedStoreText"))) {
        if (localizedStoreText("zh-CN", key) === key) missing.push(`${file}: ${key}`);
      }
    }
    expect(files.length).toBeGreaterThan(100);
    expect(missing).toEqual([]);
    expect(desktopUiText("zh-CN", "common.delete")).toBe("删除");
    expect(desktopUiText("zh-CN", "common.save")).toBe("保存");
    expect(localizedStoreText("zh-CN", "inspect.run")).toBe("AI 反推提示词");
  });

  it("describes the official 1× / 1.5× / MAX Enhance amounts under the output size", () => {
    const hint = desktopUiText("zh-CN", "enhance.outputHint");
    expect(hint).toContain("1.5×");
    expect(hint).toContain("MAX");
    expect(hint).not.toContain("2×");
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
