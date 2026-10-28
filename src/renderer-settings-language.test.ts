import { afterEach, expect, it, vi } from "vitest";
import type { AppSettings } from "./types";
import { withAppLanguage } from "./i18n";
import { artistCatalogText } from "./components/ArtistCatalogStatus";
import { useAppStore } from "./store";

// Settings written by older multi-language versions, or restored from their backups.
const stored = (language: string, version = 1) =>
  ({ language, imageProvider: "novelai", imageServiceVersion: version, imageServiceRevision: `fixture:${version}` }) as unknown as AppSettings;

afterEach(() => { vi.unstubAllGlobals(); useAppStore.setState(useAppStore.getInitialState(), true); });

function desktop(language: string) {
  let notify: (() => void) | undefined;
  const api = {
    getSettings: vi.fn().mockResolvedValue(stored(language)),
    onImageServiceChanged: vi.fn((callback: () => void) => { notify = callback; return vi.fn(); }),
    onGenerationPreview: vi.fn(() => vi.fn()),
    accountCached: vi.fn().mockResolvedValue({ hasToken: false }), isFirstRun: vi.fn().mockResolvedValue(false),
    getHistoryDates: vi.fn().mockResolvedValue([]), getHistoryGroups: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
  };
  vi.stubGlobal("window", { naiDesktop: api });
  useAppStore.setState(useAppStore.getInitialState(), true);
  return { api, notify: () => notify!() };
}

it("keeps zh-CN settings untouched and rewrites any other UI language", () => {
  const current = stored("zh-CN");
  expect(withAppLanguage(current)).toBe(current);
  expect(withAppLanguage(stored("en-US"))).toEqual({ ...stored("en-US"), language: "zh-CN" });
  expect(withAppLanguage({ ...stored("ja-JP"), language: undefined } as unknown as AppSettings).language).toBe("zh-CN");
});

it("forces zh-CN on the initial load, every full refresh and image-service notifications", async () => {
  const host = desktop("en-US");
  await useAppStore.getState().load();
  expect(useAppStore.getState().settings?.language).toBe("zh-CN");

  host.api.getSettings.mockResolvedValue(stored("ko-KR", 2));
  await useAppStore.getState().refreshSettings();
  expect(useAppStore.getState().settings).toMatchObject({ language: "zh-CN", imageServiceVersion: 2 });

  useAppStore.setState({ settings: null });
  host.api.getSettings.mockResolvedValue(stored("zh-TW", 3));
  host.notify();
  await vi.waitFor(() => expect(useAppStore.getState().settings).toMatchObject({ language: "zh-CN", imageServiceVersion: 3 }));
});

it("language-indexed text tables still resolve after settings from an older version load", async () => {
  desktop("en-US");
  await useAppStore.getState().load();
  // Components index tables such as TEXT[language] directly, without a fallback.
  expect(artistCatalogText(useAppStore.getState().settings!.language).updateCancelled).toBe("已取消更新，原快照与当前候选保持不变。");
});
