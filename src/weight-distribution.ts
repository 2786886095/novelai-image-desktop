export type WeightControlMode = "novice" | "advanced";

export interface WeightDistributionConfig {
  min: number;
  max: number;
  mode: number;
  leftDispersion: number;
  rightDispersion: number;
  /** Moves the complete artist string towards the mode without changing the
   * relative gaps between weights, except where a value reaches a bound. */
  softBalance: number;
}

export const DEFAULT_WEIGHT_DISTRIBUTION = {
  mode: 0.8,
  leftDispersion: 0.4,
  rightDispersion: 0.4,
  softBalance: 0,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function normalizeWeightDistribution(
  value: Partial<WeightDistributionConfig>,
  fallbackMin = 0.2,
  fallbackMax = 1.2,
): WeightDistributionConfig {
  const rawMin = Number.isFinite(value.min) ? Number(value.min) : fallbackMin;
  const rawMax = Number.isFinite(value.max) ? Number(value.max) : fallbackMax;
  const min = clamp(Math.min(rawMin, rawMax), 0.05, 10);
  const max = clamp(Math.max(rawMin, rawMax), min, 10);
  const midpoint = min + (max - min) / 2;
  return {
    min,
    max,
    mode: clamp(Number.isFinite(value.mode) ? Number(value.mode) : midpoint, min, max),
    leftDispersion: clamp(Number.isFinite(value.leftDispersion) ? Number(value.leftDispersion) : DEFAULT_WEIGHT_DISTRIBUTION.leftDispersion, 0, 1),
    rightDispersion: clamp(Number.isFinite(value.rightDispersion) ? Number(value.rightDispersion) : DEFAULT_WEIGHT_DISTRIBUTION.rightDispersion, 0, 1),
    softBalance: clamp(Number.isFinite(value.softBalance) ? Number(value.softBalance) : DEFAULT_WEIGHT_DISTRIBUTION.softBalance, 0, 1),
  };
}

const roundDisplayedWeight = (value: number) =>
  Math.round((value + Number.EPSILON) * 10) / 10;

function unitSample(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? clamp(value, 0, 1 - Number.EPSILON) : 0.5;
}

/**
 * Samples a split distribution whose peak is the requested mode. Each side
 * has an independent dispersion: 0 clusters close to the mode, while 1
 * approaches a uniform spread across that side. This implementation is
 * intentionally local and dependency-free.
 */
export function sampleControlledWeight(
  config: WeightDistributionConfig,
  random: () => number = Math.random,
) {
  const normalized = normalizeWeightDistribution(config, config.min, config.max);
  const leftSpan = normalized.mode - normalized.min;
  const rightSpan = normalized.max - normalized.mode;
  if (leftSpan <= 0 && rightSpan <= 0) return normalized.min;

  const chooseLeft = rightSpan <= 0 || (leftSpan > 0 && unitSample(random) < leftSpan / (leftSpan + rightSpan));
  const dispersion = chooseLeft ? normalized.leftDispersion : normalized.rightDispersion;
  // Split-Beta distance: dispersion 0 => Beta(1, 12), 1 => Beta(1, 1).
  const concentration = 12 - 11 * dispersion;
  const distance = 1 - Math.pow(1 - unitSample(random), 1 / concentration);
  const value = chooseLeft
    ? normalized.mode - leftSpan * distance
    : normalized.mode + rightSpan * distance;
  // Quantize to the same one-decimal value that is shown in the prompt UI.
  return roundDisplayedWeight(clamp(value, normalized.min, normalized.max));
}

/**
 * Applies a single translation to the whole string. A strength of 0 keeps the
 * samples untouched; 1 moves their mean to the requested mode whenever the
 * configured bounds do not clip individual values.
 */
export function softBalanceWeights(
  weights: readonly number[],
  config: WeightDistributionConfig,
): number[] {
  if (weights.length === 0) return [];
  const normalized = normalizeWeightDistribution(config, config.min, config.max);
  if (normalized.softBalance <= 0) return [...weights];
  const mean = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  const shift = (normalized.mode - mean) * normalized.softBalance;
  return weights.map((weight) =>
    roundDisplayedWeight(clamp(weight + shift, normalized.min, normalized.max)));
}

export interface WeightDistributionPreviewBin {
  start: number;
  end: number;
  center: number;
  probability: number;
}

/** Exact CDF for the split Beta(1, beta) sampler used above. */
export function controlledWeightCdf(
  rawConfig: WeightDistributionConfig,
  value: number,
): number {
  const config = normalizeWeightDistribution(rawConfig, rawConfig.min, rawConfig.max);
  if (value <= config.min) return 0;
  if (value >= config.max) return 1;
  const leftSpan = config.mode - config.min;
  const rightSpan = config.max - config.mode;
  const totalSpan = leftSpan + rightSpan;
  if (totalSpan <= 0) return value < config.mode ? 0 : 1;
  if (value <= config.mode) {
    if (leftSpan <= 0) return 0;
    const beta = 12 - 11 * config.leftDispersion;
    const normalized = clamp((value - config.min) / leftSpan, 0, 1);
    return (leftSpan / totalSpan) * Math.pow(normalized, beta);
  }
  if (rightSpan <= 0) return 1;
  const beta = 12 - 11 * config.rightDispersion;
  const normalized = clamp((value - config.mode) / rightSpan, 0, 1);
  return leftSpan / totalSpan
    + (rightSpan / totalSpan) * (1 - Math.pow(1 - normalized, beta));
}

/** Exact probability density used by the preview curve. Keeping this next to
 * the sampler prevents the chart from drifting away from the generated data. */
export function controlledWeightPdf(
  rawConfig: WeightDistributionConfig,
  value: number,
  side: "left" | "right" | "auto" = "auto",
): number {
  const config = normalizeWeightDistribution(rawConfig, rawConfig.min, rawConfig.max);
  const leftSpan = config.mode - config.min;
  const rightSpan = config.max - config.mode;
  const totalSpan = leftSpan + rightSpan;
  if (totalSpan <= 0 || value < config.min || value > config.max) return 0;
  const useLeft = side === "left" || (side === "auto" && value <= config.mode);
  if (useLeft) {
    if (leftSpan <= 0) return 0;
    const beta = 12 - 11 * config.leftDispersion;
    const normalized = clamp((value - config.min) / leftSpan, 0, 1);
    return beta * Math.pow(normalized, beta - 1) / totalSpan;
  }
  if (rightSpan <= 0) return 0;
  const beta = 12 - 11 * config.rightDispersion;
  const normalized = clamp((config.max - value) / rightSpan, 0, 1);
  return beta * Math.pow(normalized, beta - 1) / totalSpan;
}

/** Deterministic bin probabilities for the UI preview; no Monte Carlo noise. */
export function buildWeightDistributionPreview(
  rawConfig: WeightDistributionConfig,
  binCount = 36,
): WeightDistributionPreviewBin[] {
  const config = normalizeWeightDistribution(rawConfig, rawConfig.min, rawConfig.max);
  const count = Math.max(8, Math.min(96, Math.floor(binCount)));
  const span = config.max - config.min;
  if (span <= 0) {
    return [{ start: config.min, end: config.max, center: config.min, probability: 1 }];
  }
  return Array.from({ length: count }, (_, index) => {
    const start = config.min + span * index / count;
    const end = config.min + span * (index + 1) / count;
    return {
      start,
      end,
      center: (start + end) / 2,
      probability: Math.max(0, controlledWeightCdf(config, end) - controlledWeightCdf(config, start)),
    };
  });
}
