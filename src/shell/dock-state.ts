import { create } from "zustand";
import { normalizeAppLanguage } from "../i18n";

export const DOCK_STORAGE_KEY = "langbai.shell.floating-dock.v4";
export const BASELINE_STORAGE_KEY = "langbai.shell.baseline.v2";
export const SUBPANEL_MIN_WIDTH = 300;
export const SUBPANEL_MAX_WIDTH = 520;
export const SUBPANEL_DEFAULT_WIDTH = 368;

export interface FloatingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SnapPreviewZone = "left" | "right" | "subpanel" | null;

export interface PersistedDockPrefs {
  railOpen: boolean;
  leftCollapsed: boolean;
  leftFloating: boolean;
  leftFloatRect: FloatingRect;
  subpanelDocked: boolean;
  subpanelFloatPos: { x: number; y: number } | null;
  subpanelWidth: number;
  rightFloating: boolean;
  rightFloatRect: FloatingRect;
}

export const DEFAULT_DOCK_PREFS: PersistedDockPrefs = {
  railOpen: false,
  leftCollapsed: false,
  leftFloating: false,
  leftFloatRect: { x: 76, y: 58, w: 380, h: 680 },
  subpanelDocked: false,
  subpanelFloatPos: null,
  subpanelWidth: SUBPANEL_DEFAULT_WIDTH,
  rightFloating: false,
  rightFloatRect: { x: 860, y: 58, w: 340, h: 660 },
};

export function clampSubpanelWidth(width: number): number {
  if (!Number.isFinite(width)) return SUBPANEL_DEFAULT_WIDTH;
  return Math.round(Math.max(SUBPANEL_MIN_WIDTH, Math.min(SUBPANEL_MAX_WIDTH, width)));
}

export function clampFloatingRect(rect: FloatingRect, vw = 1440, vh = 900): FloatingRect {
  const w = Math.round(Math.max(280, Math.min(Math.max(320, vw - 40), rect.w || 360)));
  const h = Math.round(Math.max(280, Math.min(Math.max(320, vh - 64), rect.h || 620)));
  const x = Math.round(Math.max(8, Math.min(Math.max(8, vw - w - 8), rect.x)));
  const y = Math.round(Math.max(46, Math.min(Math.max(46, vh - 72), rect.y)));
  return { x, y, w, h };
}

function isRect(v: unknown): v is FloatingRect {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.x === "number" && typeof r.y === "number" && typeof r.w === "number" && typeof r.h === "number";
}

export function readDockPrefs(): PersistedDockPrefs {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DOCK_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_DOCK_PREFS };
    const parsed = JSON.parse(raw) as Partial<PersistedDockPrefs>;
    return {
      railOpen: typeof parsed.railOpen === "boolean" ? parsed.railOpen : DEFAULT_DOCK_PREFS.railOpen,
      leftCollapsed: typeof parsed.leftCollapsed === "boolean" ? parsed.leftCollapsed : DEFAULT_DOCK_PREFS.leftCollapsed,
      leftFloating: typeof parsed.leftFloating === "boolean" ? parsed.leftFloating : DEFAULT_DOCK_PREFS.leftFloating,
      leftFloatRect: isRect(parsed.leftFloatRect) ? parsed.leftFloatRect : { ...DEFAULT_DOCK_PREFS.leftFloatRect },
      subpanelDocked: typeof parsed.subpanelDocked === "boolean" ? parsed.subpanelDocked : DEFAULT_DOCK_PREFS.subpanelDocked,
      subpanelFloatPos:
        parsed.subpanelFloatPos && typeof parsed.subpanelFloatPos.x === "number" && typeof parsed.subpanelFloatPos.y === "number"
          ? { x: Math.round(parsed.subpanelFloatPos.x), y: Math.round(parsed.subpanelFloatPos.y) }
          : null,
      subpanelWidth: typeof parsed.subpanelWidth === "number" ? clampSubpanelWidth(parsed.subpanelWidth) : DEFAULT_DOCK_PREFS.subpanelWidth,
      rightFloating: typeof parsed.rightFloating === "boolean" ? parsed.rightFloating : DEFAULT_DOCK_PREFS.rightFloating,
      rightFloatRect: isRect(parsed.rightFloatRect) ? parsed.rightFloatRect : { ...DEFAULT_DOCK_PREFS.rightFloatRect },
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
  leftPeek: boolean;
  rightPeek: boolean;
  snapPreview: SnapPreviewZone;
  setRailOpen: (open: boolean) => void;
  toggleRailOpen: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  toggleLeftCollapsed: () => void;
  setLeftPeek: (peek: boolean) => void;
  floatLeftPanel: (rect: FloatingRect) => void;
  dockLeftPanel: () => void;
  setSubpanelDocked: (docked: boolean) => void;
  setSubpanelFloatPos: (pos: { x: number; y: number } | null) => void;
  setSubpanelWidth: (width: number, persist?: boolean) => void;
  setRightPeek: (peek: boolean) => void;
  floatRightPanel: (rect: FloatingRect) => void;
  dockRightPanel: () => void;
  setSnapPreview: (zone: SnapPreviewZone) => void;
  resetToBaseline: () => void;
}

function snapshotOf(state: PersistedDockPrefs): PersistedDockPrefs {
  return {
    railOpen: state.railOpen,
    leftCollapsed: state.leftCollapsed,
    leftFloating: state.leftFloating,
    leftFloatRect: state.leftFloatRect,
    subpanelDocked: state.subpanelDocked,
    subpanelFloatPos: state.subpanelFloatPos,
    subpanelWidth: state.subpanelWidth,
    rightFloating: state.rightFloating,
    rightFloatRect: state.rightFloatRect,
  };
}

export const useDockStore = create<DockStoreState>((set, get) => ({
  ...readDockPrefs(),
  leftPeek: false,
  rightPeek: false,
  snapPreview: null,
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
    set({ leftCollapsed, leftFloating: false, leftPeek: false });
    writeDockPrefs(snapshotOf(get()));
  },
  toggleLeftCollapsed: () => {
    const s = get();
    if (s.leftFloating) {
      set({ leftFloating: false, leftCollapsed: true, leftPeek: false });
    } else {
      set({ leftCollapsed: !s.leftCollapsed, leftPeek: false });
    }
    writeDockPrefs(snapshotOf(get()));
  },
  setLeftPeek: (leftPeek) => set({ leftPeek }),
  floatLeftPanel: (rect) => {
    const clamped = typeof window !== "undefined" ? clampFloatingRect(rect, window.innerWidth, window.innerHeight) : rect;
    set({ leftFloating: true, leftCollapsed: false, leftPeek: false, leftFloatRect: clamped });
    writeDockPrefs(snapshotOf(get()));
  },
  dockLeftPanel: () => {
    set({ leftFloating: false, leftCollapsed: false, leftPeek: false });
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelDocked: (subpanelDocked) => {
    set({ subpanelDocked, subpanelFloatPos: subpanelDocked ? null : get().subpanelFloatPos });
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelFloatPos: (subpanelFloatPos) => {
    set({ subpanelFloatPos, subpanelDocked: false });
    writeDockPrefs(snapshotOf(get()));
  },
  setSubpanelWidth: (width, persist = true) => {
    const clamped = clampSubpanelWidth(width);
    set({ subpanelWidth: clamped });
    if (persist) writeDockPrefs(snapshotOf(get()));
  },
  setRightPeek: (rightPeek) => set({ rightPeek }),
  floatRightPanel: (rect) => {
    const clamped = typeof window !== "undefined" ? clampFloatingRect(rect, window.innerWidth, window.innerHeight) : rect;
    set({ rightFloating: true, rightPeek: false, rightFloatRect: clamped });
    writeDockPrefs(snapshotOf(get()));
  },
  dockRightPanel: () => {
    set({ rightFloating: false, rightPeek: false });
    writeDockPrefs(snapshotOf(get()));
  },
  setSnapPreview: (snapPreview) => set({ snapPreview }),
  resetToBaseline: () => {
    set({ ...DEFAULT_DOCK_PREFS, leftPeek: false, rightPeek: false, snapPreview: null });
    writeDockPrefs({ ...DEFAULT_DOCK_PREFS });
  },
}));

/** Ensure first launch into the redesigned shell starts on the clean baseline
 *  workspace (collapsed 56px rail + docked left params + collapsed right strip)
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
    collapseLeft: "收起参数栏",
    expandLeft: "展开参数栏",
    leftParamsShort: "参数",
    collapseRight: "关闭历史与素材悬浮窗",
    expandRight: "展开历史与素材悬浮窗",
    resetBaseline: "恢复默认基准布局",
    subpanelResize: "拖动调整弹窗宽度；双击恢复默认",
    dragHeaderHint: "悬浮弹窗（点击外部或按 Esc 关闭）",
    snapLeftLabel: "左侧工作区",
    snapRightLabel: "右侧工作区",
    snapSubpanelLabel: "参数栏右侧",
  },
  "zh-TW": {
    collapseLeft: "收起參數欄",
    expandLeft: "展開參數欄",
    leftParamsShort: "參數",
    collapseRight: "關閉歷史與素材懸浮窗",
    expandRight: "展開歷史與素材懸浮窗",
    resetBaseline: "恢復預設基準版面",
    subpanelResize: "拖曳調整彈窗寬度；雙擊恢復預設",
    dragHeaderHint: "懸浮彈窗（點擊外部或按 Esc 關閉）",
    snapLeftLabel: "左側工作區",
    snapRightLabel: "右側工作區",
    snapSubpanelLabel: "參數欄右側",
  },
  "en-US": {
    collapseLeft: "Collapse parameter panel",
    expandLeft: "Expand parameter panel",
    leftParamsShort: "Params",
    collapseRight: "Close History floating popover",
    expandRight: "Open History floating popover",
    resetBaseline: "Reset baseline workspace layout",
    subpanelResize: "Drag to resize popover; double-click to reset",
    dragHeaderHint: "Floating popover (click outside or press Esc to close)",
    snapLeftLabel: "Left workspace",
    snapRightLabel: "Right workspace",
    snapSubpanelLabel: "Beside parameters",
  },
  "ja-JP": {
    collapseLeft: "パラメーター欄を折りたたむ",
    expandLeft: "パラメーター欄を展開",
    leftParamsShort: "設定",
    collapseRight: "履歴ポップオーバーを閉じる",
    expandRight: "履歴ポップオーバーを開く",
    resetBaseline: "標準レイアウトに戻す",
    subpanelResize: "ドラッグで幅調整・ダブルクリックで初期化",
    dragHeaderHint: "フローティングポップオーバー（外側クリックまたは Esc で閉じる）",
    snapLeftLabel: "左側ワークスペース",
    snapRightLabel: "右側ワークスペース",
    snapSubpanelLabel: "設定欄の横",
  },
  "ko-KR": {
    collapseLeft: "매개변수 패널 접기",
    expandLeft: "매개변수 패널 펼치기",
    leftParamsShort: "매개변수",
    collapseRight: "기록 플로팅 창 닫기",
    expandRight: "기록 플로팅 창 열기",
    resetBaseline: "기본 레이아웃 복원",
    subpanelResize: "드래그하여 너비 조절 · 더블클릭 초기화",
    dragHeaderHint: "플로팅 팝오버 (바깥쪽 클릭 또는 Esc 키로 닫기)",
    snapLeftLabel: "왼쪽 작업 영역",
    snapRightLabel: "오른쪽 작업 영역",
    snapSubpanelLabel: "매개변수 옆",
  },
} as const;

export function dockText(language?: string) {
  return DOCK_TEXT[normalizeAppLanguage(language)] ?? DOCK_TEXT["zh-CN"];
}

/** When dismissing a floating popover by clicking on the center canvas / image,
 *  swallow the trailing click so the image's fullscreen lightbox doesn't pop open
 *  accidentally, while leaving real buttons/links interactive in a single click. */
export function swallowCanvasClickOnDismiss(target: HTMLElement | null) {
  if (!target || typeof window === "undefined") return;
  if (!target.closest(".persistent-canvas-stage")) return;
  if (target.closest("button, a, input, select, textarea, label, [role='button'], .char-position-marker")) return;
  const absorb = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", absorb, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", absorb, true), 400);
}
