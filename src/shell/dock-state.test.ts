import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASELINE_STORAGE_KEY,
  clampFloatingRect,
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
  useDockStore.setState({ ...DEFAULT_DOCK_PREFS, leftPeek: false, rightPeek: false, snapPreview: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useDockStore.setState({ ...DEFAULT_DOCK_PREFS, leftPeek: false, rightPeek: false, snapPreview: null });
});

describe("floating & snap-dockable panel state", () => {
  it("starts on the clean baseline workspace with subpanels floating by default", () => {
    const prefs = readDockPrefs();
    expect(prefs).toMatchObject({
      railOpen: false,
      leftCollapsed: false,
      leftFloating: false,
      subpanelDocked: false,
      subpanelFloatPos: null,
      subpanelWidth: 368,
      rightFloating: false,
    });
  });

  it("persists floating coordinates and magnetic snap-dock transitions for left, subpanel and right panels", () => {
    const store = useDockStore.getState();
    store.floatLeftPanel({ x: 140, y: 80, w: 390, h: 640 });
    store.floatRightPanel({ x: 760, y: 90, w: 350, h: 620 });
    store.setSubpanelFloatPos({ x: 480, y: 72 });
    store.setSubpanelWidth(410);

    expect(readDockPrefs()).toMatchObject({
      leftFloating: true,
      leftFloatRect: { x: 140, y: 80, w: 390, h: 640 },
      rightFloating: true,
      rightFloatRect: { x: 760, y: 90, w: 350, h: 620 },
      subpanelDocked: false,
      subpanelFloatPos: { x: 480, y: 72 },
      subpanelWidth: 410,
    });

    store.dockLeftPanel();
    store.dockRightPanel();
    store.setSubpanelDocked(true);
    expect(readDockPrefs()).toMatchObject({
      leftFloating: false,
      rightFloating: false,
      subpanelDocked: true,
      subpanelFloatPos: null,
    });

    store.resetToBaseline();
    expect(readDockPrefs()).toEqual(DEFAULT_DOCK_PREFS);
    expect(storage.has(DOCK_STORAGE_KEY)).toBe(true);
  });

  it("clamps subpanel width and floating rects safely within viewport bounds", () => {
    expect(clampSubpanelWidth(120)).toBe(SUBPANEL_MIN_WIDTH);
    expect(clampSubpanelWidth(980)).toBe(SUBPANEL_MAX_WIDTH);
    expect(clampSubpanelWidth(Number.NaN)).toBe(DEFAULT_DOCK_PREFS.subpanelWidth);
    const clamped = clampFloatingRect({ x: -200, y: -50, w: 400, h: 600 }, 1280, 800);
    expect(clamped.x).toBeGreaterThanOrEqual(8);
    expect(clamped.y).toBeGreaterThanOrEqual(46);
  });

  it("initializes right history collapsed once on fresh baseline without overwriting saved preference", () => {
    const calls: boolean[] = [];
    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([true]);
    expect(storage.get(BASELINE_STORAGE_KEY)).toBe("1");

    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([true]);
  });

  it("respects an existing history-collapsed preference on baseline upgrade", () => {
    storage.set("langbai.ws.history-collapsed", "false");
    const calls: boolean[] = [];
    ensureBaselineWorkspace((value) => calls.push(value));
    expect(calls).toEqual([]);
  });

  it("exposes localized floating-dock hints in all five UI languages", () => {
    for (const lang of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
      const t = dockText(lang);
      expect(t.dragHeaderHint).toBeTruthy();
      expect(t.snapLeftLabel).toBeTruthy();
      expect(t.snapRightLabel).toBeTruthy();
    }
  });
});
