import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../store';
import { clampFloatingRect, useDockStore } from '../shell/dock-state';
import { historyRailText, HISTORY_MIN_WIDTH, HISTORY_MAX_WIDTH, HISTORY_COLLAPSE_AT } from '../workspace-history';

function dockStripShortLabel(language: unknown): string {
  const map: Record<string, string> = {
    'zh-CN': '历史与素材',
    'zh-TW': '歷史與素材',
    'en-US': 'History',
    'ja-JP': '履歴と素材',
    'ko-KR': '기록·소재',
  };
  return map[String(language)] ?? map['zh-CN'];
}

let rightPeekCloseTimer: number | undefined;
let rightPeekOpenTimer: number | undefined;

function scheduleRightPeekOpen() {
  if (rightPeekCloseTimer !== undefined) {
    window.clearTimeout(rightPeekCloseTimer);
    rightPeekCloseTimer = undefined;
  }
  if (useDockStore.getState().rightPeek) return;
  if (rightPeekOpenTimer !== undefined) window.clearTimeout(rightPeekOpenTimer);
  rightPeekOpenTimer = window.setTimeout(() => {
    rightPeekOpenTimer = undefined;
    useDockStore.getState().setRightPeek(true);
  }, 85);
}

function cancelRightPeekOpen() {
  if (rightPeekOpenTimer !== undefined) {
    window.clearTimeout(rightPeekOpenTimer);
    rightPeekOpenTimer = undefined;
  }
}

export function scheduleRightPeekClose(delay = 180) {
  cancelRightPeekOpen();
  if (rightPeekCloseTimer !== undefined) window.clearTimeout(rightPeekCloseTimer);
  rightPeekCloseTimer = window.setTimeout(() => {
    rightPeekCloseTimer = undefined;
    if (document.querySelector('.select-menu-popover[data-disclosure-open="true"], .history-action-menu, .context-menu, [data-studio-portal] .modal-backdrop')) {
      return;
    }
    useDockStore.getState().setRightPeek(false);
  }, delay);
}

export function keepRightPeekAlive() {
  cancelRightPeekOpen();
  if (rightPeekCloseTimer !== undefined) {
    window.clearTimeout(rightPeekCloseTimer);
    rightPeekCloseTimer = undefined;
  }
}

export function HistoryRailControls() {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const width = useAppStore(s => s.wsRightWidth);
  const activeTab = useAppStore(s => s.activeTab);
  const language = useAppStore(s => s.settings?.language);
  const historyCount = useAppStore(s => (s as { history?: unknown[] }).history?.length ?? 0);
  const rightFloating = useDockStore(s => s.rightFloating);
  const text = historyRailText(language);
  const shortLabel = dockStripShortLabel(language);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const showAsStrip = collapsed && !rightFloating;
  const showAsSplitter = !collapsed && !rightFloating;
  const cancel = () => {
    drag.current = null;
    useAppStore.getState().setWsHistoryDragWidth(null);
  };
  useEffect(() => {
    cancel();
    return cancel;
  }, [activeTab, collapsed, rightFloating]);
  const modified = showAsSplitter && width !== 340;
  return <div
    className={`ws-resizer right history-rail-control${showAsStrip ? ' is-collapsed dock-strip right-dock-strip' : showAsSplitter ? ' is-open' : ' is-floating-detached'}`}
    data-collapsed={showAsStrip ? 'true' : 'false'}
    data-modified={modified ? 'true' : 'false'}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={text.resize} aria-controls="history-rail-pane"
    aria-valuemin={0} aria-valuemax={HISTORY_MAX_WIDTH}
    aria-valuenow={showAsStrip ? 0 : width} title={showAsStrip ? text.show : text.resize}
    onMouseEnter={() => { if (showAsStrip) scheduleRightPeekOpen(); }}
    onMouseLeave={() => { if (showAsStrip) scheduleRightPeekClose(180); }}
    onPointerDown={event => {
      if (!showAsSplitter || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width };
      useAppStore.getState().setWsHistoryDragWidth(width);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const raw = drag.current.width + drag.current.x - event.clientX;
      const next = raw <= HISTORY_COLLAPSE_AT ? 0 : Math.max(HISTORY_MIN_WIDTH, Math.min(HISTORY_MAX_WIDTH, raw));
      useAppStore.getState().setWsHistoryDragWidth(next);
    }}
    onPointerUp={event => {
      if (!drag.current) return;
      drag.current = null;
      useAppStore.getState().commitWsHistoryDragWidth();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={() => {
      if (!showAsSplitter) return;
      const state = useAppStore.getState();
      state.setWsWidth('right', 340);
      state.saveWsWidths();
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      const state = useAppStore.getState();
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        useDockStore.getState().dockRightPanel();
        state.setWsHistoryCollapsed(!state.wsHistoryCollapsed);
      } else if (event.key === 'ArrowLeft' && !state.wsHistoryCollapsed) {
        event.preventDefault();
        state.setWsWidth('right', Math.min(HISTORY_MAX_WIDTH, state.wsRightWidth + 24));
        state.saveWsWidths();
      } else if (event.key === 'ArrowRight' && !state.wsHistoryCollapsed) {
        event.preventDefault();
        if (state.wsRightWidth <= HISTORY_MIN_WIDTH) state.setWsHistoryCollapsed(true);
        else { state.setWsWidth('right', state.wsRightWidth - 24); state.saveWsWidths(); }
      } else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    }}
  >
    <button type="button" className="history-rail-toggle"
      aria-label={collapsed ? text.show : text.hide} title={collapsed ? text.show : text.hide}
      aria-expanded={!collapsed} aria-controls="history-rail-pane"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onClick={() => {
        cancelRightPeekOpen();
        useDockStore.getState().dockRightPanel();
        useAppStore.getState().setWsHistoryCollapsed(!useAppStore.getState().wsHistoryCollapsed);
      }}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={collapsed ? '12.5,5 7.5,10 12.5,15' : '7.5,5 12.5,10 7.5,15'} />
      </svg>
    </button>
    {showAsStrip && (
      <button
        type="button"
        className="dock-strip-tab"
        title={text.show}
        aria-label={text.show}
        onPointerDown={event => event.stopPropagation()}
        onClick={() => {
          cancelRightPeekOpen();
          useDockStore.getState().dockRightPanel();
          useAppStore.getState().setWsHistoryCollapsed(false);
        }}
      >
        <span className="dock-strip-label">{shortLabel}</span>
        {historyCount > 0 && <em className="dock-strip-badge">{historyCount}</em>}
      </button>
    )}
    <span className="ws-resizer-grip" />
    {showAsSplitter && (
      <button
        type="button"
        className="ws-resizer-reset"
        title={text.resize}
        aria-label={text.resize}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          const state = useAppStore.getState();
          state.setWsWidth('right', 340);
          state.saveWsWidths();
        }}
      >
        ↺
      </button>
    )}
  </div>;
}

export function HistoryRailPane({ children }: { children: ReactNode }) {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const dragWidth = useAppStore(s => s.wsHistoryDragWidth);
  const rightWidth = useAppStore(s => s.wsRightWidth);
  const rightFloating = useDockStore(s => s.rightFloating);
  const rightFloatRect = useDockStore(s => s.rightFloatRect);
  const rightPeek = useDockStore(s => s.rightPeek);
  const floatResizeRef = useRef<{ startX: number; startLeft: number; startW: number } | null>(null);

  const isPeeking = collapsed && !rightFloating && rightPeek;
  const hidden = !rightFloating && !isPeeking && (dragWidth === null ? collapsed : dragWidth === 0);
  const activeWidth = rightFloating
    ? rightFloatRect.w
    : dragWidth === null ? rightWidth : Math.max(HISTORY_MIN_WIDTH, dragWidth);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = hidden; }, [hidden]);

  const style: CSSProperties = rightFloating
    ? ({
        '--history-drawer-w': `${rightFloatRect.w}px`,
        left: `${rightFloatRect.x}px`,
        top: `${rightFloatRect.y}px`,
        width: `${rightFloatRect.w}px`,
        height: `${rightFloatRect.h}px`,
      } as CSSProperties)
    : ({ '--history-drawer-w': `${activeWidth}px` } as CSSProperties);

  const modeClass = rightFloating
    ? 'is-free-floating is-open'
    : isPeeking
      ? 'is-peek-floating is-open'
      : `is-docked${hidden ? ' is-collapsed' : ' is-open'}`;

  return <div
    ref={ref}
    id="history-rail-pane"
    className={`history-rail ${modeClass}`}
    style={style}
    aria-hidden={hidden}
    onMouseEnter={() => { if (isPeeking || (collapsed && !rightFloating)) keepRightPeekAlive(); }}
    onMouseLeave={() => { if (isPeeking) scheduleRightPeekClose(180); }}
  >
    {(rightFloating || isPeeking) && (
      <div
        className="floating-edge-resizer left"
        role="separator"
        aria-orientation="vertical"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          floatResizeRef.current = {
            startX: event.clientX,
            startLeft: rightFloating ? rightFloatRect.x : 0,
            startW: activeWidth,
          };
        }}
        onPointerMove={event => {
          if (!floatResizeRef.current) return;
          const dx = floatResizeRef.current.startX - event.clientX;
          const nextW = Math.max(HISTORY_MIN_WIDTH, Math.min(HISTORY_MAX_WIDTH, floatResizeRef.current.startW + dx));
          if (rightFloating) {
            const nextLeft = floatResizeRef.current.startLeft + (floatResizeRef.current.startW - nextW);
            useDockStore.getState().floatRightPanel(
              clampFloatingRect({ ...rightFloatRect, x: nextLeft, w: nextW }, window.innerWidth, window.innerHeight),
            );
          } else {
            useAppStore.getState().setWsWidth('right', nextW);
          }
        }}
        onPointerUp={event => {
          if (!floatResizeRef.current) return;
          floatResizeRef.current = null;
          if (!rightFloating) useAppStore.getState().saveWsWidths();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <span className="ws-resizer-grip" />
      </div>
    )}
    {children}
  </div>;
}
