import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ONLINE_GALLERY_SOURCES, onlineGallerySourceInfo } from "./online-gallery";
import { PROMPT_CODEX_BOOKS } from "./prompt-codex";
import { ACTIVE_TABS } from "./app/navigation";
import { desktopUiText, SUPPORTED_APP_LANGUAGES } from "./i18n";
import labels from "../shared/quicktag-ui.json";

describe("QuickTagCloud and nai4.top are identified separately", () => {
  it("keeps QuickTagCloud in the existing gallery, not a new main tab", () => {
    expect(ONLINE_GALLERY_SOURCES.filter(source => source.id === "quicktag")).toHaveLength(1);
    expect(onlineGallerySourceInfo("quicktag").label).toBe("QuickTagCloud");
    expect(onlineGallerySourceInfo("quicktag").siteUrl).toBe("https://novelai.quicktagcloud.com");
    expect([...ACTIVE_TABS]).not.toContain("quicktag");
  });
  it("retains all personal Codex books at nai4.top", () => {
    expect(PROMPT_CODEX_BOOKS).toHaveLength(3);
    expect(PROMPT_CODEX_BOOKS.every(book => new URL(book.sourceUrl).hostname === "nai4.top")).toBe(true);
  });
  it("identifies the personal Codex source and QuickTag collections in every language", () => {
    for (const { code } of SUPPORTED_APP_LANGUAGES) {
      const title = desktopUiText(code, "promptCodex.enabled");
      expect(title).toContain("nai4.top");
      expect(title).not.toContain("QuickTagCloud");
      expect(labels[code].hint).toContain("QuickTagCloud");
    }
    expect(labels["zh-CN"].catalog).toBe("全部资料库");
    expect(labels["en-US"].catalog).toBe("All collections");
  });
  it("uses the adapter's name without the misleading Codex suffix", () => {
    const source = fs.readFileSync(new URL("./AitagGallery.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('QuickTagCloud ·');
    expect(source).toContain('return onlineGallerySourceInfo(source).label;');
    expect(source).toContain('<span>{onlineGallerySourceInfo(item.source).label}</span>');
  });
});
