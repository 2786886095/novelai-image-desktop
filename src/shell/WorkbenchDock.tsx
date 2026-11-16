import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AppPortal } from "../components/ui";
import { motionReduced } from "../motion-system";
import { useAppStore } from "../store";
import { dockText, SUBPANEL_DEFAULT_WIDTH, useDockStore } from "./dock-state";

const DockContext = createContext<HTMLElement | null>(null);

export function WorkbenchDockProvider({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  return <DockContext.Provider value={host}>{children}</DockContext.Provider>;
}

export function useWorkbenchDock() {
  return useContext(DockContext);
}

export function useDeferredPanelPresence(open: boolean, closeMs = 180) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (motionReduced()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), closeMs);
    return () => window.clearTimeout(timer);
  }, [open, closeMs]);
  return open || mounted;
}

function closeDockedPanel(slot: HTMLElement | null) {
  const close = slot?.querySelector<HTMLButtonElement>(".modal > header button[aria-label], .modal > header button:last-child");
  close?.click();
}

/** Floating popover container for left-side sub-panels (Character Prompts,
 *  Vibe Transfer, Precise Reference, Advanced Params). */
export function WorkbenchDockPane({ onHost }: { onHost: (host: HTMLDivElement | null) => void }) {
  const language = useAppStore((s) => s.settings?.language);
  const dt = dockText(language);
  const width = useDockStore((s) => s.subpanelWidth);
  const setWidth = useDockStore((s) => s.setSubpanelWidth);
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [resizing, setResizing] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const bindHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
    onHost(node);
  }, [onHost]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const sync = () => {
      const slots = [...node.querySelectorAll<HTMLElement>(":scope > .workbench-dock-slot")];
      if (slots.length === 0) {
        setPhase("closed");
      } else if (slots.some((slot) => slot.dataset.closing !== "true")) {
        setPhase("open");
      } else {
        setPhase("closing");
      }
    };
    const childObserver = new MutationObserver(sync);
    childObserver.observe(node, { childList: true });
    const attrObserver = new MutationObserver(sync);
    attrObserver.observe(node, { attributes: true, subtree: true, attributeFilter: ["data-closing"] });
    sync();
    return () => {
      childObserver.disconnect();
      attrObserver.disconnect();
    };
  }, []);

  const active = phase === "open";

  // Dismiss floating sub-panel when clicking outside (except on its own triggers, character canvas markers, or portalled popovers)
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || shellRef.current?.contains(target)) return;
      if (
        target.closest(
          ".qf-ref-trigger, .prompt-advanced-button, .char-position-marker, [data-studio-portal], .select-menu-popover, .ac-dropdown, .context-menu, .menu-pop, .app-confirm-backdrop, .modal-backdrop",
        )
      ) {
        return;
      }
      closeDockedPanel(hostRef.current);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [active]);

  return (
    <div
      ref={shellRef}
      className={clsx(
        "workbench-dock-shell is-floating",
        phase === "open" && "is-open",
        phase === "closing" && "is-closing",
        phase === "closed" && "is-closed",
        resizing && "is-resizing",
      )}
      style={{ "--subpanel-w": `${width}px` } as CSSProperties}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
    >
      <div className="workbench-dock" ref={bindHost} />
      {active && (
        <div
          className="workbench-dock-resizer"
          role="separator"
          aria-orientation="vertical"
          title={dt.subpanelResize}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
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

/** Drop-in replacement for AppPortal used by floating workbench sub-panels. */
export function DockOrPortal({ children, closing = false }: { children: ReactNode; closing?: boolean }) {
  const dock = useWorkbenchDock();
  if (!dock) return closing ? null : <AppPortal>{children}</AppPortal>;
  return createPortal(
    <div
      className="workbench-dock-slot"
      data-closing={closing ? "true" : "false"}
      inert={closing || undefined}
      aria-hidden={closing || undefined}
      onKeyDown={(event) => {
        if (closing || event.key !== "Escape" || event.nativeEvent.isComposing || event.defaultPrevented) return;
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
