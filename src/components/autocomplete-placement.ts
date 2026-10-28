// Keeps the prompt box's tag suggestion list inside the part of the window that shows it.

/** A vertical span in viewport pixels. */
export interface VerticalRange {
  top: number;
  bottom: number;
}

/** Which side of the caret line the list opens on; `maxHeight` is set only when the
 * list has to be shorter than its content to fit. */
export interface AutocompleteListFit {
  above: boolean;
  maxHeight?: number;
}

/** The list's height limit, as in the .ac-dropdown rule. */
export const AUTOCOMPLETE_LIST_MAX_HEIGHT = 260;
// Space kept between the list and the edge of the visible area.
const EDGE = 4;

/**
 * Below the caret line when the whole list fits there, as before; otherwise above it
 * when there is more room above. When neither side shows the whole list, it takes the
 * side with more room and its height is capped to that room.
 * `line` is the caret line, `visible` the range the list can be seen in, `height` the
 * list's full height and `gap` the space between the caret line and the list.
 */
export function fitAutocompleteList(line: VerticalRange, visible: VerticalRange, height: number, gap: number): AutocompleteListFit {
  const full = Math.min(height, AUTOCOMPLETE_LIST_MAX_HEIGHT);
  const below = visible.bottom - EDGE - (line.bottom + gap);
  if (full <= below) return { above: false };
  const above = line.top - gap - (visible.top + EDGE);
  if (full <= above) return { above: true };
  return { above: above > below, maxHeight: Math.max(0, Math.floor(Math.max(above, below))) };
}

/** The vertical range in which `element` can be seen: the window, cut down by every
 * ancestor that clips its overflow, such as a scrolling panel or a dialog body. */
export function visibleVerticalRange(element: Element): VerticalRange {
  const { defaultView: view, body, documentElement } = element.ownerDocument;
  const range = { top: 0, bottom: view?.innerHeight ?? Number.POSITIVE_INFINITY };
  if (!view) return range;
  for (let parent = element.parentElement; parent && parent !== body && parent !== documentElement; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (style.overflowY !== "visible") {
      const top = parent.getBoundingClientRect().top + parent.clientTop;
      range.top = Math.max(range.top, top);
      range.bottom = Math.min(range.bottom, top + parent.clientHeight);
    }
    // A fixed box, such as a dialog, is not clipped by its own ancestors.
    if (style.position === "fixed") break;
  }
  return range;
}
