/**
 * Scroll events are captured at document level so a portalled menu can close
 * when its anchor scrolls away. Scrolling the menu itself is different: that
 * is how users reach later options and must keep the menu open.
 */
export function isScrollInsideFloatingMenu(
  menu: Pick<Node, "contains"> | null,
  target: EventTarget | null,
): boolean {
  if (!menu || !target) return false;
  try {
    return menu.contains(target as Node);
  } catch {
    return false;
  }
}
