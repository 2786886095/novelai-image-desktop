import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { desktopUiText } from "./i18n";
import { createDefaultImageTaskPromptPreset } from "./tavern/image-task-preset";
// Actual SettingsModal storage section and handler with deterministic hooks;
// an element-tree check, not a native GUI acceptance claim.
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, settings: {} as any, writes: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: any) => { const n = h.cursor++; if (!(n in h.slots)) h.slots[n] = typeof initial === "function" ? initial() : initial; return [h.slots[n], (next: any) => { h.slots[n] = typeof next === "function" ? next(h.slots[n]) : next; }]; },
  useRef: (initial: any) => { const n = h.cursor++; return h.slots[n] ??= { current: initial }; },
  useMemo: (fn: () => any) => fn(), useCallback: (fn: any) => fn, useEffect: () => {}, useLayoutEffect: () => {},
}));
vi.mock("./store", () => ({ useAppStore: Object.assign((selector: any) => selector({ settings: h.settings, refreshSettings: async () => {}, setShowOnboarding: vi.fn() }), { getState: () => ({ settings: h.settings, setToast: vi.fn() }) }) }));
vi.mock("./use-studio-motion", () => ({ useStudioRegionMotion: () => ({ current: null }) }));
vi.mock("./prompt-ui-settings", async original => ({ ...await original<typeof import("./prompt-ui-settings")>(), takeRequestedSettingsSection: () => "storage" }));
vi.mock("./components/confirm", () => ({ confirmAction: async () => true }));
import { SettingsModal } from "./App";
type Node = ReactElement<Record<string, any>>;
const walk = (value: any): Node[] => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === "object" && "props" in value ? [value, ...walk(value.props.children)] : [];
const render = () => { h.cursor = 0; return walk(SettingsModal({ onClose: () => {} })); };
const tick = () => new Promise(r => setTimeout(r, 10));
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.writes.mockReset();
  h.settings = { language: "zh-CN", outputDir: "C:/fixture", keepImageMetadata: true, reverseConvertPromptPresets: [createDefaultImageTaskPromptPreset("convert"), createDefaultImageTaskPromptPreset("reverse")], reverseConvertPromptPresetId: "builtin-ig5-convert", convertSystemPromptPresetId: "builtin-ig5-convert", reverseSystemPromptPresetId: "builtin-ig5-reverse" };
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("window", { location: { search: "" }, naiDesktop: { aitagCacheStats: async () => ({ bytes: 0, files: 0 }), setSetting: async (key: string, value: any) => { h.writes(key, value); h.settings[key] = value; } } });
});
afterEach(() => { vi.unstubAllGlobals(); });

for (const language of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
  it(`storage section offers PNG / lossless WebP next to the metadata switch (${language})`, async () => {
    h.settings.language = language;
    const nodes = render();
    const label = desktopUiText(language, "settings.imageOutputFormat");
    expect(label).not.toBe("settings.imageOutputFormat");
    const select = nodes.find(n => n.props["aria-label"] === label)!;
    expect(select).toBeTruthy();
    // Older settings without the field show PNG, the unchanged default.
    expect(select.props.value).toBe("png");
    const options = walk(select.props.children).filter(n => n.type === "option").map(n => n.props.value);
    expect(options).toEqual(["png", "webp"]);
    const toggleIndex = nodes.findIndex(n => n.props.label === desktopUiText(language, "settings.keepMetadata"));
    expect(toggleIndex).toBeGreaterThanOrEqual(0);
    expect(nodes.indexOf(select)).toBeGreaterThan(toggleIndex);
    expect(desktopUiText(language, "settings.keepMetadataDesc")).not.toMatch(/整图重新编码为 PNG|re-encode the entire PNG/);
    select.props.onChange({ target: { value: "webp" } });
    await tick();
    expect(h.writes).toHaveBeenCalledWith("imageOutputFormat", "webp");
    expect(render().find(n => n.props["aria-label"] === label)!.props.value).toBe("webp");
  });
}
