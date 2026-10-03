const DEFAULT_SELECT_LAYER = 20000;
const MAX_CSS_LAYER = 2147483647;

function numericLayer(value: string): number | undefined {
  const text = value.trim();
  if (!/^-?\d+$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : undefined;
}

/** Body portals must paint above the panel that owns their trigger. */
export function selectPortalLayerAbove(base: number, ancestorLayers: readonly string[]): number {
  let layer = Number.isSafeInteger(base) && base > 0
    ? Math.min(base, MAX_CSS_LAYER)
    : DEFAULT_SELECT_LAYER;
  for (const value of ancestorLayers) {
    const ancestor = numericLayer(value);
    if (ancestor != null && ancestor >= layer) {
      layer = Math.min(ancestor + 1, MAX_CSS_LAYER);
    }
  }
  return layer;
}

export function resolveSelectPortalLayer(trigger: Element): number {
  const view = trigger.ownerDocument.defaultView;
  if (!view) return DEFAULT_SELECT_LAYER;
  const base = numericLayer(view.getComputedStyle(trigger.ownerDocument.documentElement)
    .getPropertyValue('--z-overlay-top')) ?? DEFAULT_SELECT_LAYER;
  const layers: string[] = [];
  for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
    layers.push(view.getComputedStyle(parent).zIndex);
  }
  return selectPortalLayerAbove(base, layers);
}
