import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AppPortal } from "../components/ui";
import { motionReduced } from "../motion-system";
import { useAppStore } from "../store";
import { dockText, SUBPANEL_DEFAULT_WIDTH, useDockStore } from "./dock-state";

/** Host element for workbench sub-panels (character prompts, vibe transfer,
 *  precise references, advanced parameters). Slides smoothly from left to right
 *  beside the parameter column and collapses leftward when closed. */
const DockContext = createContext<HTMLElement | null>(null);

export function WorkbenchDockProvider({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  return <DockContext.Provider value={host}>{children}</DockContext.Provider>;
}

export function useWorkbenchDock() {
  return useContext(DockContext);
}

function closeDockedPanel(slot: HTMLElement) {
  const close = slot.querySelector<HTMLButtonElement>(".modal > header button[aria-label], .modal > header button:last-child");
  close?.click();
}

export function WorkbenchDockPane({ onHost }: { onHost: (host: HTMLDivElement | null) => void }) {
  const language = useAppStore((s) => s.settings?.language);
  const dt = dockText(language);
  const width = useDockStore((s) => s.subpanelWidth);
  const setWidth = useDockStore((s) => s.setSubpanelWidth);
  const [hasContent, setHasContent] = useState(false);
  const [leavingHtml, setLeavingHtml] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastSnapshotRef = useRef<string>("");
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    onHost(node);
  }, [onHost]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    let leaveTimer: number | undefined;
    const sync = () => {
      const count = node.childElementCount;
      if (count > 0) {
        if (leaveTimer !== undefined) {
          window.clearTimeout(leaveTimer);
          leaveTimer = undefined;
        }
        setLeavingHtml(null);
        setHasContent(true);
        lastSnapshotRef.current = node.innerHTML;
      } else {
        setHasContent(false);
        if (!motionReduced() && lastSnapshotRef.current) {
          const clean = lastSnapshotRef.current
            .replace(/\sid="[^"]*"/g, "")
            .replace(/\sautofocus(?:="[^"]*")?/g, "");
          setLeavingHtml(clean);
          lastSnapshotRef.current = "";
          leaveTimer = window.setTimeout(() => setLeavingHtml(null), 180);
        } else {
          lastSnapshotRef.current = "";
          setLeavingHtml(null);
        }
      }
    };
    const observer = new MutationObserver(() => {
      if (node.childElementCount > 0) {
        lastSnapshotRef.current = node.innerHTML;
      }
      sync();
    });
    observer.observe(node, { childList: true });
    sync();
    return () => {
      observer.disconnect();
      if (leaveTimer !== undefined) window.clearTimeout(leaveTimer);
    };
  }, []);

  const visible = hasContent || Boolean(leavingHtml);

  return (
    <div
      className={clsx(
        "workbench-dock-shell is-floating",
        hasContent && "is-open",
        !hasContent && leavingHtml && "is-leaving",
        !visible && "is-closed",
      )}
      style={{ "--subpanel-w": `${width}px` } as CSSProperties}
      aria-hidden={!hasContent || undefined}
    >
      <div className="workbench-dock" ref={bindHost} />
      {!hasContent && leavingHtml ? (
        <div
          className="workbench-dock workbench-dock-ghost"
          inert
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: leavingHtml }}
        />
      ) : null}
      {visible && (
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
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            setWidth(dragRef.current.startW + (event.clientX - dragRef.current.startX), false);
          }}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            const finalWidth = dragRef.current.startW + (event.clientX - dragRef.current.startX);
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setWidth(finalWidth, true);
          }}
          onDoubleClick={() => setWidth(SUBPANEL_DEFAULT_WIDTH, true)}
        >
          <span className="ws-resizer-grip" />
        </div>
      )}
    </div>
  );
}

/** Drop-in replacement for AppPortal used by workbench sub-panels. */
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
