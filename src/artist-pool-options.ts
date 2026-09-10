export const DEFAULT_ARTIST_POOL_COUNT = 1000;
export const MAX_ARTIST_POOL_COUNT = 1_000_000;
export function normalizeArtistPoolCount(value: unknown): number {
  const n = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_ARTIST_POOL_COUNT, Math.floor(n))) : DEFAULT_ARTIST_POOL_COUNT;
}
