import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppStore } from "./store";

/** List state remains in its owner. Only a detail-return restores this snapshot;
 * a fresh search or page change must never reuse it. */
export function useGalleryReturn(
  pageRef: RefObject<HTMLElement | null>,
  detailOpen: boolean,
  closeDetail: () => void,
  previewOpen: boolean,
  closePreview: () => void,
  sourceActive = true,
) {
  const active = useAppStore(state => state.activeTab === "onlineGallery");
  const position = useRef<{ top: number; left: number } | null>(null);
  const restoring = useRef(false);
  const cancelRestore = useRef<(() => void) | null>(null);
  const discardReturnPosition = useCallback(() => {
    cancelRestore.current?.();
    position.current = null;
    restoring.current = false;
  }, []);
  const rememberList = useCallback(() => {
    cancelRestore.current?.();
    const page = pageRef.current;
    position.current = page ? { top: page.scrollTop, left: page.scrollLeft } : null;
    restoring.current = false;
  }, [pageRef]);
  const returnToList = useCallback(() => {
    restoring.current = true;
    closeDetail();
  }, [closeDetail]);
  const leaveForSearch = useCallback(() => {
    discardReturnPosition();
    closeDetail();
  }, [closeDetail, discardReturnPosition]);
  useLayoutEffect(() => {
    if (detailOpen || !restoring.current) return;
    const page = pageRef.current;
    if (!page) return;
    restoring.current = false;
    if (position.current) {
      const saved = position.current;
      let frame = 0;
      let attempts = 0;
      let cancelled = false;
      const previousAnchor = page.style.overflowAnchor;
      page.style.overflowAnchor = "none";
      // Masonry cards measure their row spans after mount. Restoring before
      // that measurement would clamp a valid saved offset to a tiny list.
      const restore = () => {
        if (cancelled) return;
        page.scrollTop = saved.top;
        page.scrollLeft = saved.left;
        if (++attempts < 60) frame = requestAnimationFrame(restore);
        else page.style.overflowAnchor = previousAnchor;
      };
      const cancel = () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        page.style.overflowAnchor = previousAnchor;
      };
      cancelRestore.current = cancel;
      page.addEventListener("wheel", cancel, { once: true, passive: true });
      page.addEventListener("pointerdown", cancel, { once: true });
      page.addEventListener("keydown", cancel, { once: true });
      restore();
      return () => {
        cancel();
        if (cancelRestore.current === cancel) cancelRestore.current = null;
        page.removeEventListener("wheel", cancel);
        page.removeEventListener("pointerdown", cancel);
        page.removeEventListener("keydown", cancel);
      };
    }
  }, [detailOpen, pageRef]);
  useEffect(() => {
    if (!active || !sourceActive || !detailOpen) return;
    const back = () => {
      // A preview is one level above detail. Unrelated dialogs own their input.
      if (document.querySelector(".modal-backdrop:not(.artist-ranking-lightbox-backdrop)")) return false;
      if (previewOpen) closePreview();
      else returnToList();
      return true;
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "BrowserBack" || event.key === "GoBack" ||
          (event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowLeft")) {
        if (back()) { event.preventDefault(); event.stopPropagation(); }
      }
    };
    window.addEventListener("keydown", keyboard);
    const unsubscribe = window.naiDesktop.onNavigateBack?.(back);
    return () => { window.removeEventListener("keydown", keyboard); unsubscribe?.(); };
  }, [active, sourceActive, detailOpen, previewOpen, closePreview, returnToList]);
  return { rememberList, returnToList, leaveForSearch, discardReturnPosition };
}
