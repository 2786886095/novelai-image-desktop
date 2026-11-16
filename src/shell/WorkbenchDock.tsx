import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AppPortal } from "../components/ui";
import { useAppStore } from "../store";
import { dockText, SUBPANEL_DEFAULT_WIDTH, useDockStore } from "./dock-state";

/** Host element for dockable workbench sub-panels (character prompts, vibe
 *  transfer, precise references, advanced parameters). Docks inline beside the
 *  parameter column with zero-latency drag resize and snap-collapse, without
 *  covering the center canvas or requiring any pin button. */
const DockContext = createContext<HTMLElement | null>(null);

export function WorkbenchDockProvider({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  return <DockContext.Provider value={host}>{children}</DockContext.Provider>;
}

export function useWorkbenchDock() {
  return useContext(DockContext);
}

function closeDockedPanel(slot: HTMLElement | null) {
  const close = slot?.querySelector<HTMLButtonElement>(".modal > header button[aria-label], .modal > header button:last-child");
  close?.click();
}

export function WorkbenchDockPane({ onHost }: { onHost: (host: HTMLDivElement | null) => void }) {
  const language = useAppStore((s) => s.settings?.language);
  const dt = dockText(language);
  const width = useDockStore((s) => s.subpanelWidth);
  const setWidth = useDockStore((s) => s.setSubpanelWidth);
  const [hasContent, setHasContent] = useState(false);
  const [resizing, setResizing] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    onHost(node);
  }, [onHost]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const sync = () => setHasContent(node.childElementCount > 0);
    const observer = new MutationObserver(sync);
    observer.observe(node, { childList: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={clsx(
        "workbench-dock-shell is-docked",
        hasContent ? "is-open" : "is-closed",
        resizing && "is-resizing",
      )}
      style={{ "--subpanel-w": `${width}px` } as CSSProperties}
      aria-hidden={!hasContent || undefined}
      inert={!hasContent || undefined}
    >
      <div className="workbench-dock" ref={bindHost} />
      {hasContent && (
        <div
          className="workbench-dock-resizer"
          role="separator"
          aria-orientation="vertical"
          title={dt.subpanelResize}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { startX: event.clientX, startW: width };
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            const raw = dragRef.current.startW + (event.clientX - dragRef.current.startX);
            if (raw >= 150) setWidth(raw, false);
          }}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            const raw = dragRef.current.startW + (event.clientX - dragRef.current.startX);
            const fallbackW = dragRef.current.startW;
            dragRef.current = null;
            setResizing(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (raw < 150) {
              setWidth(fallbackW, true);
              closeDockedPanel(hostRef.current);
            } else {
              setWidth(raw, true);
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setResizing(false);
          }}
          onDoubleClick={() => setWidth(SUBPANEL_DEFAULT_WIDTH, true)}
        >
          <span className="ws-resizer-grip" />
        </div>
      )}
    </div>
  );
}

/** Drop-in replacement for AppPortal used by dockable workbench sub-panels. */
export function DockOrPortal({ children }: { children: ReactNode }) {
  const dock = useWorkbenchDock();
  if (!dock) return <AppPortal>{children}</AppPortal>;
  return createPortal(
    <div
      className="workbench-dock-slot"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing || event.defaultPrevented) return;
        if (document.querySelector('.select-menu-popover[data-disclosure-open="true"], .ac-dropdown, .tag-suggestions, .autocomplete-popover, .menu-pop[data-disclosure-open="true"]')) return;
        event.preventDefault();
        closeDockedPanel(event.currentTarget);
      }}
    >
      {children}
    </div>,
    dock,
  );
}
