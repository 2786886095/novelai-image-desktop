/** Includes the one no-artist baseline image. Not a hard product limit. */
export const DEFAULT_ARTIST_IMAGE_BUDGET = 300;
export const DEFAULT_ARTIST_BATCH_SIZE = 8;

export function iterationInteger(value: unknown, fallback: number, min = 1): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(Math.floor(value))
    ? Math.max(min, Math.floor(value)) : fallback;
}

export function planArtistImages(imageBudget: number, batchSize: number) {
  const batch = iterationInteger(batchSize, DEFAULT_ARTIST_BATCH_SIZE);
  const budget = iterationInteger(imageBudget, DEFAULT_ARTIST_IMAGE_BUDGET, 2);
  return { imageBudget: budget, iterationRounds: Math.ceil((budget - 1) / batch) };
}

export function planArtistRounds(rounds: number, batchSize: number) {
  const batch = iterationInteger(batchSize, DEFAULT_ARTIST_BATCH_SIZE);
  const count = iterationInteger(rounds, Math.ceil((DEFAULT_ARTIST_IMAGE_BUDGET - 1) / batch));
  const budget = 1 + count * batch;
  if (!Number.isSafeInteger(budget)) return planArtistImages(DEFAULT_ARTIST_IMAGE_BUDGET, batch);
  return { imageBudget: budget, iterationRounds: count };
}

/** Preserve existing image budgets; infer missing round counts without losing results. */
export function restoreArtistIteration(saved: { batchSize?: number; imageBudget?: number; iterationRounds?: number } | null) {
  const batchSize = Math.min(40, iterationInteger(saved?.batchSize, DEFAULT_ARTIST_BATCH_SIZE));
  const plan = planArtistImages(saved?.imageBudget ?? DEFAULT_ARTIST_IMAGE_BUDGET, batchSize);
  return { batchSize, ...plan, iterationRounds: iterationInteger(saved?.iterationRounds, plan.iterationRounds) };
}

export function nextArtistBatch(round: number, rounds: number, used: number, budget: number, batch: number) {
  return round >= rounds ? 0 : Math.max(0, Math.min(batch, budget - used));
}
