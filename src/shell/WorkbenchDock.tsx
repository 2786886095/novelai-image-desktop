import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppPortal } from "../components/ui";

/** Host element for docked workbench panels (character prompts, references,
 *  advanced parameters). When present, those panels render beside the canvas
 *  instead of as blocking modals, so the preview and history stay usable. */
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

/** Drop-in replacement for AppPortal used by dockable workbench panels. */
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
