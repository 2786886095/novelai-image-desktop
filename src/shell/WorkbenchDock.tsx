import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { AppPortal } from "../components/ui";
import { motionReduced } from "../motion-system";
import { useAppStore } from "../store";
import {
  clampFloatingRect,
  dockText,
  SUBPANEL_DEFAULT_WIDTH,
  useDockStore,
  type FloatingRect,
  type SnapPreviewZone,
} from "./dock-state";

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

/** Magnetic snap-dock dropzone indicator rendered inside `.workspace` when dragging a panel header. */
export function DockSnapOverlay() {
  const zone = useDockStore((s) => s.snapPreview);
  const language = useAppStore((s) => s.settings?.language);
  if (!zone) return null;
  const dt = dockText(language);
  const label =
    zone === "left" ? dt.snapLeftLabel : zone === "right" ? dt.snapRightLabel : dt.snapSubpanelLabel;
  return (
    <div className={clsx("qf-dock-snap-overlay", `zone-${zone}`)} aria-hidden="true">
      <span className="qf-dock-snap-pill">{label}</span>
    </div>
  );
}

/** Shared zero-rerender header drag controller for Left, Right, and Sub-panel Floating Dock Panels. */
export function useFloatingHeaderDrag({
  kind,
  panelRef,
  onDock,
  onFloat,
}: {
  kind: "left" | "right";
  panelRef: RefObject<HTMLElement | null>;
  onDock: () => void;
  onFloat: (rect: FloatingRect) => void;
}) {
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a, [role='button']")) return;
      const panel = panelRef.current;
      if (!panel) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const initialRect = panel.getBoundingClientRect();
      const offsetX = startX - initialRect.left;
      const offsetY = startY - initialRect.top;
      const w = Math.round(Math.max(300, initialRect.width));
      const h = Math.round(Math.max(420, Math.min(window.innerHeight - 76, initialRect.height)));
      let dragging = false;
      let activeSnap: SnapPreviewZone = null;

      const updateSnap = (next: SnapPreviewZone) => {
        if (activeSnap !== next) {
          activeSnap = next;
          useDockStore.getState().setSnapPreview(next);
        }
      };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < 6) return;
          dragging = true;
          panel.dataset.draggingFloat = "true";
          document.body.style.userSelect = "none";
          // Immediately free the dock slot so the workspace reveals full canvas underneath
          const nextRect = clampFloatingRect(
            { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w, h },
            window.innerWidth,
            window.innerHeight,
          );
          onFloat(nextRect);
        }

        const clamped = clampFloatingRect(
          { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w, h },
          window.innerWidth,
          window.innerHeight,
        );
        panel.style.left = `${clamped.x}px`;
        panel.style.top = `${clamped.y}px`;

        const railRight = document.querySelector(".shell-rail-slot")?.getBoundingClientRect().right ?? 56;
        if (kind === "left" && ev.clientX <= railRight + 82) {
          updateSnap("left");
        } else if (kind === "right" && ev.clientX >= window.innerWidth - 82) {
          updateSnap("right");
        } else {
          updateSnap(null);
        }
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.userSelect = "";
        delete panel.dataset.draggingFloat;
        const finalSnap = activeSnap;
        updateSnap(null);
        if (!dragging) return;

        if ((kind === "left" && finalSnap === "left") || (kind === "right" && finalSnap === "right")) {
          panel.style.left = "";
          panel.style.top = "";
          onDock();
        } else {
          const clamped = clampFloatingRect(
            { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w, h },
            window.innerWidth,
            window.innerHeight,
          );
          onFloat(clamped);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [kind, onDock, onFloat, panelRef],
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, select, textarea, a")) return;
      onDock();
    },
    [onDock],
  );

  return { onPointerDown, onDoubleClick };
}

function closeDockedPanel(slot: HTMLElement | null) {
  const close = slot?.querySelector<HTMLButtonElement>(".modal > header button[aria-label], .modal > header button:last-child");
  close?.click();
}

export function WorkbenchDockPane({ onHost }: { onHost: (host: HTMLDivElement | null) => void }) {
  const language = useAppStore((s) => s.settings?.language);
  const dt = dockText(language);
  const width = useDockStore((s) => s.subpanelWidth);
  const docked = useDockStore((s) => s.subpanelDocked);
  const floatPos = useDockStore((s) => s.subpanelFloatPos);
  const setWidth = useDockStore((s) => s.setSubpanelWidth);
  const setSubpanelDocked = useDockStore((s) => s.setSubpanelDocked);
  const setSubpanelFloatPos = useDockStore((s) => s.setSubpanelFloatPos);
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

  // Delegate header drag on `.modal > header` inside the sub-panel so user can
  // drag Character Prompts / Vibe Transfer / Advanced Params anywhere as a
  // floating panel, or drag to the left seam of `.persistent-canvas-host` to snap-dock inline!
  const onHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const header = target?.closest(".modal > header");
      if (!header || target?.closest("button, input, select, textarea, a, [role='button']")) return;
      const shell = shellRef.current;
      if (!shell) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const rect = shell.getBoundingClientRect();
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;
      let dragging = false;
      let snapInline = false;

      const onMove = (ev: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          dragging = true;
          shell.dataset.draggingFloat = "true";
          document.body.style.userSelect = "none";
          const clamped = clampFloatingRect(
            { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w: width, h: rect.height },
            window.innerWidth,
            window.innerHeight,
          );
          setSubpanelFloatPos({ x: clamped.x, y: clamped.y });
        }
        const clamped = clampFloatingRect(
          { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w: width, h: rect.height },
          window.innerWidth,
          window.innerHeight,
        );
        shell.style.left = `${clamped.x}px`;
        shell.style.top = `${clamped.y}px`;

        const hostRect = shell.parentElement?.getBoundingClientRect();
        const nearSeam = Boolean(hostRect && Math.abs(ev.clientX - hostRect.left) <= 68);
        if (nearSeam !== snapInline) {
          snapInline = nearSeam;
          useDockStore.getState().setSnapPreview(nearSeam ? "subpanel" : null);
        }
      };

      const finish = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.userSelect = "";
        delete shell.dataset.draggingFloat;
        useDockStore.getState().setSnapPreview(null);
        if (!dragging) return;

        if (snapInline) {
          shell.style.left = "";
          shell.style.top = "";
          setSubpanelDocked(true);
        } else {
          const clamped = clampFloatingRect(
            { x: ev.clientX - offsetX, y: ev.clientY - offsetY, w: width, h: rect.height },
            window.innerWidth,
            window.innerHeight,
          );
          setSubpanelFloatPos({ x: clamped.x, y: clamped.y });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [setSubpanelDocked, setSubpanelFloatPos, width],
  );

  const onHeaderDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".modal > header") || target?.closest("button, input, select, a")) return;
      if (docked || floatPos) {
        if (shellRef.current) {
          shellRef.current.style.left = "";
          shellRef.current.style.top = "";
        }
        setSubpanelFloatPos(null);
        setSubpanelDocked(false);
      }
    },
    [docked, floatPos, setSubpanelDocked, setSubpanelFloatPos],
  );

  const active = phase === "open";
  const isFreeFloating = !docked && floatPos !== null;
  const shellStyle: CSSProperties = {
    "--subpanel-w": `${width}px`,
    ...(isFreeFloating ? { left: `${floatPos.x}px`, top: `${floatPos.y}px` } : {}),
  } as CSSProperties;

  return (
    <div
      ref={shellRef}
      className={clsx(
        "workbench-dock-shell",
        docked ? "is-docked" : "is-floating",
        isFreeFloating && "is-free-floating",
        phase === "open" && "is-open",
        phase === "closing" && "is-closing",
        phase === "closed" && "is-closed",
        resizing && "is-resizing",
      )}
      style={shellStyle}
      aria-hidden={!active || undefined}
      inert={!active || undefined}
      onPointerDown={onHeaderPointerDown}
      onDoubleClick={onHeaderDoubleClick}
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

/** Drop-in replacement for AppPortal used by dockable workbench sub-panels. */
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
