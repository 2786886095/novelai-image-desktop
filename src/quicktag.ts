/** QuickTagCloud public URL/data compatibility. No prompt rewriting. */
export interface QuickCategory { path: string[]; code: string; count: number }
export interface QuickNavigation {
  collections: Array<{ id: string; title: string; count: number; type?: string; version?: string }>;
  categories: QuickCategory[];
  categoryPath: string[];
  failedCollections: string[];
  release: string;
  collectionType?: string;
  groups?: Array<{ id: string; count: number; visible: number; entries: number }>;
  catalogTotal?: number; catalogEntries?: number; hiddenCollections?: number;
  declaredCount?: number; loadedCount?: number;
}
export function quickPathCode(path: string[]): string {
  if (!path.length) return "";
  let hash = 0x811c9dc5;
  // Site path codes hash UTF-16LE code units.
  for (const unit of path.join("\u001f").split("").map((c) => c.charCodeAt(0))) {
    hash = Math.imul(hash ^ (unit & 255), 0x01000193);
    hash = Math.imul(hash ^ (unit >>> 8), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
export function quickCategories(entries: Array<Record<string, unknown>>, tree: unknown = [], empty: unknown = []): QuickCategory[] {
  const nodes = new Map<string, QuickCategory>();
  const add = (path: string[]) => {
    for (let i = 1; i <= path.length; i++) {
      const prefix = path.slice(0, i), key = JSON.stringify(prefix);
      if (!nodes.has(key)) nodes.set(key, { path: prefix, code: quickPathCode(prefix), count: 0 });
    }
  };
  const walk = (value: unknown, parent: string[] = []) => {
    if (!Array.isArray(value)) return;
    for (const node of value) if (node && typeof node.name === "string" && node.name) {
      const path = [...parent, node.name]; add(path); walk(node.children, path);
    }
  };
  walk(tree);
  if (Array.isArray(empty)) for (const path of empty) if (Array.isArray(path) && path.every(p => typeof p === "string" && p)) add(path);
  for (const entry of entries) {
    const path = Array.isArray(entry.path) ? entry.path.filter((s): s is string => typeof s === "string" && !!s) : [];
    for (let i = 1; i <= path.length; i++) {
      const prefix = path.slice(0, i), key = JSON.stringify(prefix);
      const node = nodes.get(key) ?? { path: prefix, code: quickPathCode(prefix), count: 0 };
      node.count++; nodes.set(key, node);
    }
  }
  return [...nodes.values()];
}
export function quickSafe(entry: Record<string, unknown>): boolean {
  return ![true, 1, "1", "true"].some((value) => value === entry.nsfw) && !/^(r18|r18g|nsfw|explicit|questionable|sensitive|adult)$/i.test(String(entry.rating ?? ""));
}
export function quickMatch(entry: Record<string, unknown>, query: string): boolean {
  const haystack = [entry.title, entry.tags, entry.prompt, entry.note, entry.author, entry.credit, JSON.stringify(entry.path ?? []), ...quickCharacters(entry).map((c) => `${c.label} ${c.prompt}`)].join(" ").toLowerCase();
  const tokens = query.match(/-?"[^"]+"|\S+/g) ?? [];
  return tokens.every((token) => { const exclude = token.startsWith("-"); const term = (exclude ? token.slice(1) : token).replace(/^"|"$/g, "").toLowerCase(); return !term || (exclude ? !haystack.includes(term) : haystack.includes(term)); });
}
/** Keep character blocks separate: flattening them changes multi-character prompts. */
export function quickCharacters(entry: unknown): Array<{label: string; prompt: string}> {
  if (!entry || typeof entry !== "object") return [];
  const blocks = (entry as Record<string, unknown>).characterPrompts;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block) => block && typeof block.prompt === "string" && block.prompt
    ? [{label: typeof block.label === "string" ? block.label : "", prompt: block.prompt}] : []);
}
export function quickLink(value: string): { collectionId: string; path: string[]; code: string; entry: string; query: string } | undefined {
  if (!/^https?:\/\//i.test(value)) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "novelai.quicktagcloud.com" || url.username || url.password) throw new Error("Invalid QuickTagCloud link");
  return { collectionId: url.searchParams.get("c") || url.searchParams.get("codex") || "", path: url.searchParams.getAll("path"), code: url.searchParams.get("p") || "", entry: url.searchParams.get("entry") || new URLSearchParams(url.hash.slice(1)).get("entry") || "", query: url.searchParams.get("q") || "" };
}
export function quickSourceUrl(collectionId: string, entry = "", path: string[] = []): string {
  const url = new URL("https://novelai.quicktagcloud.com/"); url.searchParams.set("c", collectionId);
  if (entry) url.searchParams.set("entry", entry);
  if (path.length) url.searchParams.set("p", quickPathCode(path));
  return url.toString();
}

export function quickCollectionType(value: unknown): string {
  return typeof value === "string" && value ? value : "other";
}
export function quickResolveCollection(catalog: Array<Record<string, unknown>>, id: string): string {
  if (!id || catalog.some(c => c.id === id)) return id;
  const matches = catalog.filter(c => Array.isArray(c.aliases) && c.aliases.includes(id));
  if (matches.length !== 1) throw new Error("QuickTagCloud collection alias is unknown or ambiguous");
  return String(matches[0].id);
}
export function quickCatalogNavigation(catalog: Array<Record<string, unknown>>, safeOnly: boolean) {
  const available = catalog.filter(c => !safeOnly || !c.nsfw);
  const types = [...new Set(["codex", "string", "composition", "pack", ...catalog.map(c => quickCollectionType(c.type))])];
  const count = (items: Array<Record<string, unknown>>) => items.reduce((sum, c) => sum + (Number(c.entryCount) || 0), 0);
  return {
    collections: available.map(c => ({ id: String(c.id), title: String(c.title), count: Number(c.entryCount) || 0, type: quickCollectionType(c.type), version: String(c.version ?? "") })),
    groups: types.map(id => ({ id, count: catalog.filter(c => quickCollectionType(c.type) === id).length, visible: available.filter(c => quickCollectionType(c.type) === id).length, entries: count(catalog.filter(c => quickCollectionType(c.type) === id)) })).filter(g => g.count > 0),
    catalogTotal: catalog.length, catalogEntries: count(catalog), hiddenCollections: catalog.length - available.length,
  };
}
