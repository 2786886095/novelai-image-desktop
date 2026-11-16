import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../store';
import { historyRailText, HISTORY_MIN_WIDTH, HISTORY_MAX_WIDTH, HISTORY_COLLAPSE_AT } from '../workspace-history';

/** When collapsed, renders only the top-right expand button (no drag-to-open
 *  bar on the empty right edge). When expanded, sits on the LEFT border of the
 *  opened right history panel as its zero-latency width-resize & snap-collapse splitter. */
export function HistoryRailControls() {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const width = useAppStore(s => s.wsRightWidth);
  const activeTab = useAppStore(s => s.activeTab);
  const language = useAppStore(s => s.settings?.language);
  const text = historyRailText(language);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const cancel = () => {
    drag.current = null;
    useAppStore.getState().setWsHistoryDragWidth(null);
  };
  useEffect(() => {
    cancel();
    return cancel;
  }, [activeTab, collapsed]);
  const modified = !collapsed && width !== 340;
  return <div
    className={`ws-resizer right history-rail-control${collapsed ? ' is-collapsed' : ' is-open'}`}
    data-collapsed={collapsed ? 'true' : 'false'}
    data-modified={modified ? 'true' : 'false'}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={text.resize} aria-controls="history-rail-pane"
    aria-valuemin={0} aria-valuemax={HISTORY_MAX_WIDTH}
    aria-valuenow={collapsed ? 0 : width} title={collapsed ? undefined : text.resize}
    onPointerDown={event => {
      if (collapsed || event.button !== 0) return;
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
      if (collapsed) return;
      const state = useAppStore.getState();
      state.setWsWidth('right', 340);
      state.saveWsWidths();
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      const state = useAppStore.getState();
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); state.setWsHistoryCollapsed(!state.wsHistoryCollapsed);
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
      onClick={() => useAppStore.getState().setWsHistoryCollapsed(!useAppStore.getState().wsHistoryCollapsed)}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={collapsed ? '12.5,5 7.5,10 12.5,15' : '7.5,5 12.5,10 7.5,15'} />
      </svg>
    </button>
    <span className="ws-resizer-grip" />
    {!collapsed && (
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
  const hidden = dragWidth === null ? collapsed : dragWidth === 0;
  const activeWidth = dragWidth === null ? rightWidth : Math.max(HISTORY_MIN_WIDTH, dragWidth);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = hidden; }, [hidden]);
  return <div
    ref={ref}
    id="history-rail-pane"
    className={`history-rail is-docked${hidden ? ' is-collapsed' : ' is-open'}`}
    style={{ '--history-drawer-w': `${activeWidth}px` } as CSSProperties}
    aria-hidden={hidden}
  >
    {children}
  </div>;
}
