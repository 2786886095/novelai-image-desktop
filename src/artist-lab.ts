export type ArtistLabModelMode = "high" | "light";
export type ArtistLabDiscoveryMode = "match" | "random";

export interface ArtistTagRecord {
  id: number;
  name: string;
  postCount: number;
  deprecated: boolean;
}

export interface ArtistRankingSnapshot {
  items: ArtistTagRecord[];
  savedAt: number;
}

export interface ArtistWeightedTag {
  name: string;
  weight: number;
}

export interface ArtistCombination {
  id: string;
  tags: ArtistWeightedTag[];
  prompt: string;
}

export interface ArtistLabImageScore {
  similarity: number;
  model: string;
}

export interface ArtistLabModelStatus {
  mode: ArtistLabModelMode;
  modelId: string;
  cachedBytes: number;
  cachedFiles: number;
}

export interface ArtistReferenceMatch {
  artist: ArtistTagRecord;
  similarity: number;
  referencePath: string;
  referenceUrl: string;
}

export interface ArtistDiscoveryResult {
  matches: ArtistReferenceMatch[];
  scanned: number;
  nextOffset: number;
  poolSize: number;
  cachedBytes: number;
}

export function normalizeArtistProgress(
  baselineSimilarity: number,
  candidateSimilarity: number,
): number {
  const baseline = Math.max(0, Math.min(1, baselineSimilarity));
  const candidate = Math.max(0, Math.min(1, candidateSimilarity));
  const remaining = Math.max(1e-6, 1 - baseline);
  return Math.max(0, Math.min(100, ((candidate - baseline) / remaining) * 100));
}

export function shouldResetArtistSearch(
  stagnantRounds: number,
  configuredRounds: number,
): boolean {
  return stagnantRounds >= Math.max(1, Math.floor(configuredRounds));
}

function clampWeight(value: number): number {
  return Math.max(0.1, Math.min(7, Math.round(value * 10) / 10));
}

export function formatArtistCombination(tags: ArtistWeightedTag[]): string {
  return tags
    .filter((tag) => tag.name.trim())
    .map((tag) => `${clampWeight(tag.weight)}::artist:${tag.name.trim()} ::`)
    .join(", ");
}

function hashCombination(tags: ArtistWeightedTag[]): string {
  return tags.map((tag) => `${tag.name}@${clampWeight(tag.weight)}`).join("+");
}

function sampleOne<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** Deterministic candidate planning keeps the preview queue identical to the generated round. */
export function createArtistLabRandom(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a bounded, diverse candidate set instead of exploding into every
 * artist/weight permutation. Match mode starts with single artists; random mode
 * explores weighted pairs/triples immediately.
 */
export function buildArtistCombinations(
  names: string[],
  count: number,
  mode: ArtistLabDiscoveryMode,
  random: () => number = Math.random,
): ArtistCombination[] {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
  if (unique.length === 0 || count <= 0) return [];
  const limit = Math.max(1, Math.min(100, Math.floor(count)));
  const weights = [0.5, 0.7, 0.9, 1, 1.1, 1.3, 1.5, 1.7, 2];
  const output: ArtistCombination[] = [];
  const seen = new Set<string>();

  const add = (tags: ArtistWeightedTag[]) => {
    const key = hashCombination(tags);
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ id: key, tags, prompt: formatArtistCombination(tags) });
  };

  if (mode === "match") {
    for (const name of unique) {
      add([{ name, weight: 1 }]);
      if (output.length >= limit) return output;
    }
  }

  const maxTags = unique.length >= 3 ? 3 : Math.min(2, unique.length);
  let attempts = 0;
  while (output.length < limit && attempts++ < limit * 80) {
    const size = mode === "random"
      ? 1 + Math.floor(random() * maxTags)
      : Math.min(maxTags, 2 + Math.floor(random() * Math.max(1, maxTags - 1)));
    const pool = [...unique];
    const tags: ArtistWeightedTag[] = [];
    while (tags.length < size && pool.length > 0) {
      const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      const [name] = pool.splice(index, 1);
      tags.push({ name, weight: sampleOne(weights, random) });
    }
    add(tags);
  }
  return output;
}
