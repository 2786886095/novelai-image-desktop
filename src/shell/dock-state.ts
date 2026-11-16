import { create } from "zustand";
import { normalizeAppLanguage } from "../i18n";

export const DOCK_STORAGE_KEY = "langbai.shell.dock.v2";
export const BASELINE_STORAGE_KEY = "langbai.shell.baseline.v2";
export const SUBPANEL_MIN_WIDTH = 300;
export const SUBPANEL_MAX_WIDTH = 520;
export const SUBPANEL_DEFAULT_WIDTH = 376;

export interface PersistedDockPrefs {
  railOpen: boolean;
  railDocked: boolean;
  leftCollapsed: boolean;
  leftDocked: boolean;
  subpanelDocked: boolean;
  subpanelWidth: number;
  rightDocked: boolean;
}

export const DEFAULT_DOCK_PREFS: PersistedDockPrefs = {
  railOpen: false,
  railDocked: false,
  leftCollapsed: false,
  leftDocked: true,
  subpanelDocked: false,
  subpanelWidth: SUBPANEL_DEFAULT_WIDTH,
  rightDocked: false,
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
      railDocked: typeof parsed.railDocked === "boolean" ? parsed.railDocked : DEFAULT_DOCK_PREFS.railDocked,
      leftCollapsed: typeof parsed.leftCollapsed === "boolean" ? parsed.leftCollapsed : DEFAULT_DOCK_PREFS.leftCollapsed,
      leftDocked: typeof parsed.leftDocked === "boolean" ? parsed.leftDocked : DEFAULT_DOCK_PREFS.leftDocked,
      subpanelDocked: typeof parsed.subpanelDocked === "boolean" ? parsed.subpanelDocked : DEFAULT_DOCK_PREFS.subpanelDocked,
      subpanelWidth: typeof parsed.subpanelWidth === "number" ? clampSubpanelWidth(parsed.subpanelWidth) : DEFAULT_DOCK_PREFS.subpanelWidth,
      rightDocked: typeof parsed.rightDocked === "boolean" ? parsed.rightDocked : DEFAULT_DOCK_PREFS.rightDocked,
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
  setRailDocked: (docked: boolean) => void;
  toggleRailDocked: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  setLeftDocked: (docked: boolean) => void;
  toggleLeftDocked: () => void;
  setSubpanelDocked: (docked: boolean) => void;
  toggleSubpanelDocked: () => void;
  setSubpanelWidth: (width: number, persist?: boolean) => void;
  setRightDocked: (docked: boolean) => void;
  toggleRightDocked: () => void;
  resetToBaseline: () => void;
}

function snapshotOf(state: PersistedDockPrefs): PersistedDockPrefs {
  return {
    railOpen: state.railOpen,
    railDocked: state.railDocked,
    leftCollapsed: state.leftCollapsed,
    leftDocked: state.leftDocked,
    subpanelDocked: state.subpanelDocked,
    subpanelWidth: state.subpanelWidth,
    rightDocked: state.rightDocked,
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
  setRailDocked: (railDocked) => {
    set((s) => ({ railDocked, railOpen: railDocked ? true : s.railOpen }));
    writeDockPrefs(snapshotOf(get()));
  },
  toggleRailDocked: () => {
    const next = !get().railDocked;
    set((s) => ({ railDocked: next, railOpen: next ? true : s.railOpen }));
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
  setLeftDocked: (leftDocked) => {
    set((s) => ({ leftDocked, leftCollapsed: leftDocked ? false : s.leftCollapsed }));
    writeDockPrefs(snapshotOf(get()));
  },
  toggleLeftDocked: () => {
    const next = !get().leftDocked;
    set((s) => ({ leftDocked: next, leftCollapsed: next ? false : s.leftCollapsed }));
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelDocked: (subpanelDocked) => {
    set({ subpanelDocked });
    writeDockPrefs(snapshotOf(get()));
  },
  toggleSubpanelDocked: () => {
    const next = !get().subpanelDocked;
    set({ subpanelDocked: next });
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelWidth: (width, persist = true) => {
    const clamped = clampSubpanelWidth(width);
    set({ subpanelWidth: clamped });
    if (persist) writeDockPrefs(snapshotOf(get()));
  },
  setRightDocked: (rightDocked) => {
    set({ rightDocked });
    writeDockPrefs(snapshotOf(get()));
  },
  toggleRightDocked: () => {
    const next = !get().rightDocked;
    set({ rightDocked: next });
    writeDockPrefs(snapshotOf(get()));
  },
  resetToBaseline: () => {
    set({ ...DEFAULT_DOCK_PREFS });
    writeDockPrefs({ ...DEFAULT_DOCK_PREFS });
  },
}));

/** Ensure first launch into the redesigned shell starts on the clean baseline
 *  workspace (collapsed 56px rail + docked left params + collapsed right drawer)
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
    pin: "停靠",
    pinned: "已停靠",
    float: "悬浮",
    pinTip: "停靠固定到工作区（并排显示）",
    unpinTip: "取消固定停靠（改为悬浮抽屉，不挤压画布）",
    railTitle: "功能导航",
    collapseLeft: "收起左侧参数栏",
    expandLeft: "展开参数栏",
    leftParamsShort: "参数",
    collapseRight: "收起历史面板",
    expandRight: "展开历史面板",
    resetBaseline: "恢复基准面板布局",
    subpanelResize: "拖动调整扩展面板宽度；双击恢复默认",
  },
  "zh-TW": {
    pin: "停靠",
    pinned: "已停靠",
    float: "懸浮",
    pinTip: "停靠固定到工作區（並排顯示）",
    unpinTip: "取消固定停靠（改為懸浮抽屜，不擠壓畫布）",
    railTitle: "功能導覽",
    collapseLeft: "收起左側參數欄",
    expandLeft: "展開參數欄",
    leftParamsShort: "參數",
    collapseRight: "收起歷史面板",
    expandRight: "展開歷史面板",
    resetBaseline: "恢復基準面板版面",
    subpanelResize: "拖曳調整擴充面板寬度；雙擊恢復預設",
  },
  "en-US": {
    pin: "Dock",
    pinned: "Docked",
    float: "Float",
    pinTip: "Dock inline in the workspace",
    unpinTip: "Undock to a floating drawer without resizing the canvas",
    railTitle: "Navigation",
    collapseLeft: "Collapse parameter panel",
    expandLeft: "Show parameters",
    leftParamsShort: "Params",
    collapseRight: "Collapse history panel",
    expandRight: "Show history",
    resetBaseline: "Reset to baseline workspace",
    subpanelResize: "Drag to resize docked panel; double-click to reset",
  },
  "ja-JP": {
    pin: "ドック",
    pinned: "固定中",
    float: "フロート",
    pinTip: "作業画面に並べて固定表示",
    unpinTip: "固定を解除してフロート表示に切替",
    railTitle: "ナビゲーション",
    collapseLeft: "左パラメータ欄を閉じる",
    expandLeft: "パラメータを開く",
    leftParamsShort: "設定",
    collapseRight: "履歴パネルを閉じる",
    expandRight: "履歴パネルを開く",
    resetBaseline: "基準レイアウトに戻す",
    subpanelResize: "ドラッグで幅を調整・ダブルクリックでリセット",
  },
  "ko-KR": {
    pin: "도킹",
    pinned: "고정됨",
    float: "플로팅",
    pinTip: "작업 영역에 나란히 도킹",
    unpinTip: "도킹 해제(캔버스 크기를 유지하는 플로팅 서랍)",
    railTitle: "탐색",
    collapseLeft: "왼쪽 매개변수 패널 접기",
    expandLeft: "매개변수 펼치기",
    leftParamsShort: "매개변수",
    collapseRight: "기록 패널 접기",
    expandRight: "기록 패널 펼치기",
    resetBaseline: "기준 레이아웃으로 초기화",
    subpanelResize: "드래그하여 패널 너비 조절; 더블클릭으로 초기화",
  },
} as const;

export function dockText(language: unknown) {
  return DOCK_TEXT[normalizeAppLanguage(language)] ?? DOCK_TEXT["zh-CN"];
}
