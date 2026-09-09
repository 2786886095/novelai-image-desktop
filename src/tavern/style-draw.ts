export function drawStyleTags(tags: string[], pinned: string[], count: number, min: number, max: number, seed: number): string {
  let state = (seed >>> 0) || 0x6d2b79f5;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const fixed = [...new Set(pinned.filter((tag) => tags.includes(tag)))];
  const pool = [...new Set(tags)].filter((tag) => !fixed.includes(tag));
  const chosen = [...fixed];
  for (let i = 0; i < Math.max(0, Math.min(pool.length, Math.trunc(count))); i++) {
    const at = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[at]] = [pool[at], pool[i]];
    chosen.push(pool[i]);
  }
  const low = Math.max(0, Math.min(3, Math.min(min, max)));
  const high = Math.max(low, Math.min(3, Math.max(min, max)));
  return chosen.map((tag) => `${(Math.round((low + random() * (high - low)) * 100) / 100).toFixed(2).replace(/\.?0+$/, "")}::${tag}::`).join(", ");
}
export function appendStylePrompt(base: string, addition: string): string {
  if (!addition.trim()) return base;
  return base.trim() ? base + (base.trimEnd().endsWith(",") ? " " : ", ") + addition : addition;
}
