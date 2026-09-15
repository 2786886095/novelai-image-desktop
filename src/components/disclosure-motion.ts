import {useLayoutEffect, useState, type RefObject} from "react";

export const DISCLOSURE_MOTION = {open: 160, close: 120} as const;

/** Keep outgoing content mounted but inert. Reopening cancels the pending removal. */
export function useDisclosurePresence(open: boolean, element?: RefObject<HTMLElement | null>) {
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    const node = element?.current;
    if (!open || !node) return;
    const style = getComputedStyle(node);
    const limit = parseFloat(style.maxHeight);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const content = node.querySelector<HTMLElement>(":scope > .disclosure-options");
    if (!content) return;
    const natural = content.scrollHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const height = Math.min(natural + (border || 0), Number.isFinite(limit) ? limit : Infinity);
    node.style.setProperty("--disclosure-height", `${height}px`);
  });
  useLayoutEffect(() => {
    if (open) { setRetained(true); return; }
    if (document.documentElement.classList.contains("motion-reduced")) {
      setRetained(false); return;
    }
    const timer = window.setTimeout(() => setRetained(false), DISCLOSURE_MOTION.close);
    return () => window.clearTimeout(timer);
  }, [open]);
  useLayoutEffect(() => {
    const node = element?.current;
    if (!node) return;
    node.dataset.disclosureSettled = "false";
    if (!open) return;
    const timer = window.setTimeout(() => { node.dataset.disclosureSettled = "true"; },
      document.documentElement.classList.contains("motion-reduced") ? 0 : DISCLOSURE_MOTION.open);
    return () => window.clearTimeout(timer);
  }, [open, element]);
  return open || retained;
}

export function disclosureAttributes(open: boolean) {
  return {"data-disclosure-open": open ? "true" : "false", inert: !open, "aria-hidden": !open} as const;
}
