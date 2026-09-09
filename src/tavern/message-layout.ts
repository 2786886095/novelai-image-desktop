/** Read the current border box, including row spacing, not a previous estimate.
 * The library's default sync measurement can reuse its cache; that is stale
 * when the same message remounts after a resize or changes content offscreen.
 */
export function measureMessageRow(element: HTMLElement, entry?: ResizeObserverEntry): number {
  return Math.ceil(entry?.borderBoxSize?.[0]?.blockSize ?? element.getBoundingClientRect().height);
}

/** Refresh visible messages without discarding measured heights of other rows.
 * Virtualizer.measure() resets every row to its estimate. Unchanged DOM nodes
 * need not emit another ResizeObserver event, leaving long replies overlapped.
 * Mounted rows also stay observed for streaming text, media and panel resizing.
 */
export function measureMountedMessageRows(
  scroller: Pick<HTMLElement, "querySelectorAll">,
  measureElement: (element: HTMLDivElement) => void,
): void {
  scroller.querySelectorAll<HTMLDivElement>(".tavern-virtual-row[data-index]").forEach(measureElement);
}
