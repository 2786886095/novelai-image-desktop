import { useEffect, useRef, type ReactNode } from 'react';
import { useAppStore } from '../store';
import { historyRailText, HISTORY_MIN_WIDTH, HISTORY_MAX_WIDTH } from '../workspace-history';

/** The handle remains mounted while dragging through zero width. The history
 * itself stays mounted, preserving filters, selection and virtual scroll. */
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
  }, [activeTab]);
  return <div
    className="ws-resizer right history-rail-control"
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={text.resize} aria-controls="history-rail-pane"
    aria-valuemin={0} aria-valuemax={HISTORY_MAX_WIDTH}
    aria-valuenow={collapsed ? 0 : width} title={text.resize}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: collapsed ? 0 : width };
      useAppStore.getState().setWsHistoryDragWidth(drag.current.width);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      useAppStore.getState().setWsHistoryDragWidth(drag.current.width + drag.current.x - event.clientX);
    }}
    onPointerUp={event => {
      if (!drag.current) return;
      drag.current = null;
      useAppStore.getState().commitWsHistoryDragWidth();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onDoubleClick={() => {
      const state = useAppStore.getState();
      state.setWsWidth('right', 340);
      state.setWsHistoryCollapsed(false);
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      const state = useAppStore.getState();
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); state.setWsHistoryCollapsed(!state.wsHistoryCollapsed);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault(); state.setWsWidth('right', state.wsHistoryCollapsed ? state.wsRightWidth : state.wsRightWidth + 24);
        state.setWsHistoryCollapsed(false);
      } else if (event.key === 'ArrowRight') {
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
  </div>;
}

export function HistoryRailPane({ children }: { children: ReactNode }) {
  const collapsed = useAppStore(s => s.wsHistoryCollapsed);
  const dragWidth = useAppStore(s => s.wsHistoryDragWidth);
  const hidden = dragWidth === null ? collapsed : dragWidth === 0;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.inert = hidden; }, [hidden]);
  return <div ref={ref} id="history-rail-pane" className={`history-rail${hidden ? ' is-collapsed' : ''}`} aria-hidden={hidden}>
    {children}
  </div>;
}
