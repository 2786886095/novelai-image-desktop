export type PromptToolZone = 'bar' | 'more';
export type PromptToolLayout = Record<PromptToolZone, string[]>;
export const promptToolZones = ['bar', 'more'] as const;

// With undo, redo and the overflow trigger, five configurable tools fit in eight slots.
export const PROMPT_MAIN_TOOL_LIMIT = 5;
export const defaultPromptToolLayout: PromptToolLayout = {
  bar: ['translation', 'optimize', 'custom', 'weights', 'capsule'],
  more: ['presets', 'negative-library', 'normalize', 'autocomplete', 'chunks', 'restore'],
};

export function normalizePromptToolLayout(saved: unknown, defaults = defaultPromptToolLayout): PromptToolLayout {
  const allowed = new Set([...defaults.bar, ...defaults.more].filter(id => id !== 'undo' && id !== 'redo'));
  const result: PromptToolLayout = {bar: [], more: []};
  const input = saved && typeof saved === 'object' ? saved as Partial<PromptToolLayout> : {};
  for (const zone of promptToolZones) {
    const items = input[zone];
    if (!Array.isArray(items)) continue;
    for (const id of items) {
      if (typeof id !== 'string' || !allowed.delete(id)) continue;
      result[zone === 'bar' && result.bar.length >= PROMPT_MAIN_TOOL_LIMIT ? 'more' : zone].push(id);
    }
  }
  for (const zone of promptToolZones) {
    for (const id of defaults[zone]) {
      if (allowed.delete(id)) result[zone === 'bar' && result.bar.length >= PROMPT_MAIN_TOOL_LIMIT ? 'more' : zone].push(id);
    }
  }
  return result;
}

export function readGlobalPromptToolLayout(raw: string, readLegacy: (scope: string) => string): PromptToolLayout {
  // The ordinary positive editor is the legacy migration source if old editors disagree.
  const scopes = ['positive', 'character-positive', 'negative', 'character-negative'];
  for (const value of [raw, ...scopes.map(readLegacy)]) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed?.bar) && Array.isArray(parsed?.more)) return normalizePromptToolLayout(parsed);
    } catch { /* Ignore corrupt preferences without deleting them. */ }
  }
  return normalizePromptToolLayout(null);
}

export function movePromptTool(layout: PromptToolLayout, id: string, to: PromptToolZone, beforeIndex: number): PromptToolLayout {
  if (id === 'undo' || id === 'redo' || !Number.isInteger(beforeIndex)) return layout;
  const from = promptToolZones.find(zone => layout[zone].includes(id));
  if (!from || (from === 'more' && to === 'bar' && layout.bar.length >= PROMPT_MAIN_TOOL_LIMIT)) return layout;
  const old = layout[from].indexOf(id);
  const gap = Math.max(0, Math.min(beforeIndex, layout[to].length));
  const index = gap - Number(from === to && old < gap);
  if (from === to && old === index) return layout;
  const result = {bar: [...layout.bar], more: [...layout.more]};
  result[from].splice(old, 1);
  result[to].splice(index, 0, id);
  return result;
}

export function replacePromptTool(layout: PromptToolLayout, incoming: string, outgoing: string): PromptToolLayout {
  if ([incoming, outgoing].some(id => id === 'undo' || id === 'redo')) return layout;
  const from = layout.more.indexOf(incoming);
  const to = layout.bar.indexOf(outgoing);
  if (from < 0 || to < 0) return layout;
  const result = {bar: [...layout.bar], more: [...layout.more]};
  result.bar[to] = incoming;
  result.more[from] = outgoing;
  return result;
}
