import { create } from "zustand";
import { normalizeAppLanguage } from "../i18n";

export const DOCK_STORAGE_KEY = "langbai.shell.layout.v3";
export const BASELINE_STORAGE_KEY = "langbai.shell.baseline.v2";
export const SUBPANEL_MIN_WIDTH = 300;
export const SUBPANEL_MAX_WIDTH = 520;
export const SUBPANEL_DEFAULT_WIDTH = 376;

export interface PersistedDockPrefs {
  railOpen: boolean;
  leftCollapsed: boolean;
  subpanelWidth: number;
}

export const DEFAULT_DOCK_PREFS: PersistedDockPrefs = {
  railOpen: false,
  leftCollapsed: false,
  subpanelWidth: SUBPANEL_DEFAULT_WIDTH,
};

export function clampSubpanelWidth(width: number): number {
  if (!Number.isFinite(width)) return SUBPANEL_DEFAULT_WIDTH;
  return Math.round(Math.max(SUBPANEL_MIN_WIDTH, Math.min(SUBPANEL_MAX_WIDTH, width)));
}

export function readDockPrefs(): PersistedDockPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DOCK_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_DOCK_PREFS };
    const parsed = JSON.parse(raw) as Partial<PersistedDockPrefs>;
    return {
      railOpen: typeof parsed.railOpen === "boolean" ? parsed.railOpen : DEFAULT_DOCK_PREFS.railOpen,
      leftCollapsed: typeof parsed.leftCollapsed === "boolean" ? parsed.leftCollapsed : DEFAULT_DOCK_PREFS.leftCollapsed,
      subpanelWidth: typeof parsed.subpanelWidth === "number" ? clampSubpanelWidth(parsed.subpanelWidth) : DEFAULT_DOCK_PREFS.subpanelWidth,
    };
  } catch {
    return { ...DEFAULT_DOCK_PREFS };
  }
}

function writeDockPrefs(prefs: PersistedDockPrefs) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(prefs));
    }
  } catch {
    /* ignore storage quota or private mode errors */
  }
}

export interface DockStoreState extends PersistedDockPrefs {
  setRailOpen: (open: boolean) => void;
  toggleRailOpen: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  setSubpanelWidth: (width: number, persist?: boolean) => void;
  resetToBaseline: () => void;
}

function snapshotOf(state: PersistedDockPrefs): PersistedDockPrefs {
  return {
    railOpen: state.railOpen,
    leftCollapsed: state.leftCollapsed,
    subpanelWidth: state.subpanelWidth,
  };
}

export const useDockStore = create<DockStoreState>((set, get) => ({
  ...readDockPrefs(),
  setRailOpen: (railOpen) => {
    set({ railOpen });
    writeDockPrefs(snapshotOf(get()));
  },
  toggleRailOpen: () => {
    const next = !get().railOpen;
    set({ railOpen: next });
    writeDockPrefs(snapshotOf(get()));
  },
  setLeftCollapsed: (leftCollapsed) => {
    set({ leftCollapsed });
    writeDockPrefs(snapshotOf(get()));
  },
  toggleLeftCollapsed: () => {
    const next = !get().leftCollapsed;
    set({ leftCollapsed: next });
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelWidth: (width, persist = true) => {
    const clamped = clampSubpanelWidth(width);
    set({ subpanelWidth: clamped });
    if (persist) writeDockPrefs(snapshotOf(get()));
  },
  resetToBaseline: () => {
    set({ ...DEFAULT_DOCK_PREFS });
    writeDockPrefs({ ...DEFAULT_DOCK_PREFS });
  },
}));

/** Ensure first launch into the redesigned shell starts on the clean baseline
 *  workspace (collapsed 56px rail + open left params + collapsed right drawer)
 *  unless the user has already customized their history rail state. */
export function ensureBaselineWorkspace(setHistoryCollapsed: (collapsed: boolean) => void) {
  try {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("uiCapture")) return;
    if (localStorage.getItem(BASELINE_STORAGE_KEY) === "1") return;
    localStorage.setItem(BASELINE_STORAGE_KEY, "1");
    if (localStorage.getItem("langbai.ws.history-collapsed") === null) {
      setHistoryCollapsed(true);
    }
  } catch {
    /* ignore storage errors */
  }
}

const DOCK_TEXT = {
  "zh-CN": {
    collapseLeft: "收起左侧参数栏",
    expandLeft: "展开参数栏",
    leftParamsShort: "参数",
    collapseRight: "收起历史面板",
    expandRight: "展开历史面板",
    resetBaseline: "恢复默认面板布局",
    subpanelResize: "拖动调整扩展面板宽度；双击恢复默认",
  },
  "zh-TW": {
    collapseLeft: "收起左側參數欄",
    expandLeft: "展開參數欄",
    leftParamsShort: "參數",
    collapseRight: "收起歷史面板",
    expandRight: "展開歷史面板",
    resetBaseline: "恢復預設面板版面",
    subpanelResize: "拖曳調整擴充面板寬度；雙擊恢復預設",
  },
  "en-US": {
    collapseLeft: "Collapse parameter panel",
    expandLeft: "Show parameters",
    leftParamsShort: "Params",
    collapseRight: "Collapse history panel",
    expandRight: "Show history",
    resetBaseline: "Reset workspace layout",
    subpanelResize: "Drag to resize panel; double-click to reset",
  },
  "ja-JP": {
    collapseLeft: "パラメーター欄を折りたたむ",
    expandLeft: "パラメーター欄を開く",
    leftParamsShort: "設定",
    collapseRight: "履歴パネルを折りたたむ",
    expandRight: "履歴パネルを開く",
    resetBaseline: "標準レイアウトに戻す",
    subpanelResize: "ドラッグで幅調整・ダブルクリックで初期化",
  },
  "ko-KR": {
    collapseLeft: "매개변수 패널 접기",
    expandLeft: "매개변수 열기",
    leftParamsShort: "매개변수",
    collapseRight: "기록 패널 접기",
    expandRight: "기록 패널 열기",
    resetBaseline: "기본 레이아웃 복원",
    subpanelResize: "드래그하여 너비 조절 · 더블클릭 초기화",
  },
} as const;

export function dockText(language?: string) {
  return DOCK_TEXT[normalizeAppLanguage(language)] ?? DOCK_TEXT["zh-CN"];
}
