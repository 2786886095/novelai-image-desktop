import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASELINE_STORAGE_KEY,
  clampSubpanelWidth,
  DEFAULT_DOCK_PREFS,
  DOCK_STORAGE_KEY,
  dockText,
  ensureBaselineWorkspace,
  readDockPrefs,
  SUBPANEL_MAX_WIDTH,
  SUBPANEL_MIN_WIDTH,
  useDockStore,
} from "./dock-state";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
  useDockStore.setState({ ...DEFAULT_DOCK_PREFS });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useDockStore.setState({ ...DEFAULT_DOCK_PREFS });
});

describe("dockable panel state and baseline workspace", () => {
  it("starts on the clean baseline workspace by default", () => {
    const prefs = readDockPrefs();
    expect(prefs).toEqual({
      railOpen: false,
      railDocked: false,
      leftCollapsed: false,
      leftDocked: true,
      subpanelDocked: false,
      subpanelWidth: 376,
      rightDocked: false,
    });
  });

  it("persists left rail, left panel, subpanel and right panel docking toggles", () => {
    const store = useDockStore.getState();
    store.toggleRailDocked();
    expect(useDockStore.getState()).toMatchObject({ railDocked: true, railOpen: true });

    store.toggleSubpanelDocked();
    store.setSubpanelWidth(420);
    store.toggleRightDocked();
    expect(readDockPrefs()).toMatchObject({
      railDocked: true,
      railOpen: true,
      subpanelDocked: true,
      subpanelWidth: 420,
      rightDocked: true,
    });

    store.resetToBaseline();
    expect(readDockPrefs()).toEqual(DEFAULT_DOCK_PREFS);
    expect(storage.has(DOCK_STORAGE_KEY)).toBe(true);
  });

  it("clamps subpanel width safely within bounds", () => {
    expect(clampSubpanelWidth(120)).toBe(SUBPANEL_MIN_WIDTH);
    expect(clampSubpanelWidth(980)).toBe(SUBPANEL_MAX_WIDTH);
    expect(clampSubpanelWidth(Number.NaN)).toBe(DEFAULT_DOCK_PREFS.subpanelWidth);
  });

  it("initializes right history collapsed once on fresh baseline without overwriting saved preference", () => {
    const calls: boolean[] = [];
    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([true]);
    expect(storage.get(BASELINE_STORAGE_KEY)).toBe("1");

    // Second call is a no-op so user's subsequent choice is respected.
    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([true]);
  });

  it("respects an existing history-collapsed preference on baseline upgrade", () => {
    storage.set("langbai.ws.history-collapsed", "false");
    const calls: boolean[] = [];
    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([]);
  });

  it("exposes localized dock controls in all five UI languages", () => {
    for (const lang of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
      const t = dockText(lang);
      expect(t.pin).toBeTruthy();
      expect(t.pinned).toBeTruthy();
      expect(t.resetBaseline).toBeTruthy();
    }
  });
});
