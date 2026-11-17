import { useEffect, useRef, type ReactNode } from 'react';
import { swallowCanvasClickOnDismiss } from '../shell/dock-state';
import { useAppStore } from '../store';
import { historyRailText, HISTORY_MIN_WIDTH, HISTORY_MAX_WIDTH } from '../workspace-history';

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

/** Right trigger rail for the History & Materials floating popover.
 *  Always stays 38px wide on the right edge so opening/closing the right
 *  floating popover never squeezes or shifts the center canvas. */
export function HistoryRailControls() {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const width = useAppStore(s => s.wsRightWidth);
  const language = useAppStore(s => s.settings?.language);
  const historyCount = useAppStore(s => (s as { history?: unknown[] }).history?.length ?? 0);
  const text = historyRailText(language);
  const shortLabel = dockStripShortLabel(language);
  const dragStartRef = useRef<{ x: number; moved: boolean } | null>(null);
  const suppressNextClickRef = useRef(false);
  const toggleOpen = () => {
    const state = useAppStore.getState();
    state.setWsHistoryCollapsed(!state.wsHistoryCollapsed);
  };
  return <div
    className={`ws-resizer right history-rail-control dock-strip right-dock-strip${collapsed ? ' is-collapsed' : ' is-popover-active'}`}
    data-collapsed={collapsed ? 'true' : 'false'}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={collapsed ? text.show : text.hide} aria-controls="history-rail-pane"
    aria-valuemin={0} aria-valuemax={HISTORY_MAX_WIDTH}
    aria-valuenow={collapsed ? 0 : width} title={collapsed ? text.show : text.hide}
    onPointerDown={event => {
      if (event.button !== 0) return;
      suppressNextClickRef.current = false;
      dragStartRef.current = { x: event.clientX, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!dragStartRef.current) return;
      const dx = event.clientX - dragStartRef.current.x;
      if (dx < -28 && useAppStore.getState().wsHistoryCollapsed) {
        dragStartRef.current.moved = true;
        suppressNextClickRef.current = true;
        useAppStore.getState().setWsHistoryCollapsed(false);
      } else if (dx > 28 && !useAppStore.getState().wsHistoryCollapsed) {
        dragStartRef.current.moved = true;
        suppressNextClickRef.current = true;
        useAppStore.getState().setWsHistoryCollapsed(true);
      }
    }}
    onPointerUp={event => {
      dragStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }}
    onPointerCancel={() => { dragStartRef.current = null; }}
    onClick={() => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      toggleOpen();
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleOpen();
      } else if (event.key === 'Escape' && !collapsed) {
        event.preventDefault();
        useAppStore.getState().setWsHistoryCollapsed(true);
      }
    }}
  >
    <button type="button" className="history-rail-toggle"
      aria-label={collapsed ? text.show : text.hide} title={collapsed ? text.show : text.hide}
      aria-expanded={!collapsed} aria-controls="history-rail-pane"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); toggleOpen(); }}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={collapsed ? '12.5,5 7.5,10 12.5,15' : '7.5,5 12.5,10 7.5,15'} />
      </svg>
    </button>
    <button
      type="button"
      className={`dock-strip-tab${!collapsed ? ' active' : ''}`}
      title={collapsed ? text.show : text.hide}
      aria-label={collapsed ? text.show : text.hide}
      aria-expanded={!collapsed}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); toggleOpen(); }}
    >
      <span className="dock-strip-label">{shortLabel}</span>
      {historyCount > 0 && <em className="dock-strip-badge">{historyCount}</em>}
    </button>
  </div>;
}

/** Right History & Materials Floating Popover (`悬浮弹窗`).
 *  Floats cleanly over the right side of the workspace with a left-edge width
 *  resizer, directional slide-in/out animation, Escape & outside-click dismissal. */
export function HistoryRailPane({ children }: { children: ReactNode }) {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const dragWidth = useAppStore(s => s.wsHistoryDragWidth);
  const rightWidth = useAppStore(s => s.wsRightWidth);
  const language = useAppStore(s => s.settings?.language);
  const text = historyRailText(language);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const hidden = dragWidth === null ? collapsed : dragWidth === 0;
  const activeWidth = dragWidth === null ? rightWidth : Math.max(HISTORY_MIN_WIDTH, dragWidth);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = hidden; }, [hidden]);

  useEffect(() => {
    if (hidden) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || ref.current?.contains(target)) return;
      if (
        target.closest(
          '.history-rail-control, [data-studio-portal], .select-menu-popover, .history-action-menu, .context-menu, .app-confirm-backdrop, .image-preview-dialog-backdrop',
        )
      ) {
        return;
      }
      useAppStore.getState().setWsHistoryCollapsed(true);
      swallowCanvasClickOnDismiss(target);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('.select-menu-popover[data-disclosure-open="true"], .history-action-menu, .context-menu, [data-studio-portal] .modal-backdrop, .app-confirm-backdrop')) {
        return;
      }
      event.stopPropagation();
      useAppStore.getState().setWsHistoryCollapsed(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [hidden]);

  return <div
    ref={ref}
    id="history-rail-pane"
    className={`history-rail is-floating-popover${hidden ? ' is-collapsed' : ' is-open'}`}
    aria-hidden={hidden}
  >
    {!hidden && (
      <div
        className="floating-edge-resizer left"
        role="separator"
        aria-orientation="vertical"
        title={text.resize}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeRef.current = { startX: event.clientX, startW: ref.current?.offsetWidth ?? activeWidth };
        }}
        onPointerMove={event => {
          if (!resizeRef.current) return;
          const dx = resizeRef.current.startX - event.clientX;
          const nextW = Math.max(HISTORY_MIN_WIDTH, Math.min(HISTORY_MAX_WIDTH, resizeRef.current.startW + dx));
          useAppStore.getState().setWsWidth('right', nextW);
        }}
        onPointerUp={event => {
          if (!resizeRef.current) return;
          resizeRef.current = null;
          useAppStore.getState().saveWsWidths();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onDoubleClick={() => {
          const s = useAppStore.getState();
          s.setWsWidth('right', 340);
          s.saveWsWidths();
        }}
      >
        <span className="ws-resizer-grip" />
      </div>
    )}
    {children}
  </div>;
}
