export type StyleTagDrawState = { tags: string[]; modes: Record<string, "always"|"random">; min: number; max: number };
export function normalizeStyleTagCount(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(20, Math.floor(number))) : fallback;
}
export function normalizeStyleTagDrawState(raw: unknown): StyleTagDrawState {
  const value = raw && typeof raw === 'object' ? raw as Partial<StyleTagDrawState> : {};
  const seen=new Set<string>();
  const tags=(Array.isArray(value.tags)?value.tags:[]).filter((tag): tag is string => typeof tag==='string')
    .map(tag=>tag.trim()).filter(tag=>tag.length>0 && tag.length<=240 && !/[\r\n,]/.test(tag) && !seen.has(tag.toLocaleLowerCase()) && !!seen.add(tag.toLocaleLowerCase())).slice(0,10000);
  const modes=Object.fromEntries(tags.map(tag=>[tag.toLocaleLowerCase(),value.modes?.[tag.toLocaleLowerCase()]==='random'?'random':'always'])) as StyleTagDrawState['modes'];
  const a=normalizeStyleTagCount(value.min,1), b=normalizeStyleTagCount(value.max,3);
  return {tags,modes,min:a,max:b};
}
export function loadStyleTagDrawState(key: string): StyleTagDrawState {
  try {return normalizeStyleTagDrawState(JSON.parse(localStorage.getItem(key)??'{}'));}
  catch {return normalizeStyleTagDrawState(null);}
}
