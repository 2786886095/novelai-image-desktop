/** NovelAI generation dimensions are expressed in 64-pixel blocks. */
export const NAI_DIMENSION_STEP = 64;
export const NAI_MIN_DIMENSION = 64;
/** Current official custom-size ceiling: the pair may not exceed 3 Mi pixels. */
export const NAI_MAX_PIXEL_AREA = 3_145_728;
/** A single side can consume the whole area only when the other side is 64. */
export const NAI_MAX_DIMENSION = NAI_MAX_PIXEL_AREA / NAI_MIN_DIMENSION;

export interface NAIImageSize {
  width: number;
  height: number;
}

export interface NAIEnhanceOutputSize extends NAIImageSize {
  exceedsLimit: boolean;
}

export function snapNAIDimension(value: unknown, fallback = 1024): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return snapNAIDimension(fallback, 1024);
  return Math.min(
    NAI_MAX_DIMENSION,
    Math.max(
      NAI_MIN_DIMENSION,
      Math.round(parsed / NAI_DIMENSION_STEP) * NAI_DIMENSION_STEP,
    ),
  );
}

export function maxNAIDimensionFor(pairedDimension: unknown): number {
  const paired = snapNAIDimension(pairedDimension, NAI_MIN_DIMENSION);
  return Math.max(
    NAI_MIN_DIMENSION,
    Math.floor(NAI_MAX_PIXEL_AREA / paired / NAI_DIMENSION_STEP) *
      NAI_DIMENSION_STEP,
  );
}

/**
 * Commit one completed field while respecting the official total-pixel cap.
 * Callers intentionally invoke this on blur/Enter, never for each keystroke.
 */
export function snapNAIDimensionWithinArea(
  value: unknown,
  pairedDimension: unknown,
  fallback = 1024,
): number {
  return Math.min(
    snapNAIDimension(value, fallback),
    maxNAIDimensionFor(pairedDimension),
  );
}

export function fitNAIImageSize(
  width: unknown,
  height: unknown,
  fallback: NAIImageSize = { width: 832, height: 1216 },
): NAIImageSize {
  const snapped = {
    width: snapNAIDimension(width, fallback.width),
    height: snapNAIDimension(height, fallback.height),
  };
  if (snapped.width * snapped.height <= NAI_MAX_PIXEL_AREA) return snapped;

  const scale = Math.sqrt(
    NAI_MAX_PIXEL_AREA / (snapped.width * snapped.height),
  );
  return {
    width: Math.max(
      NAI_MIN_DIMENSION,
      Math.floor((snapped.width * scale) / NAI_DIMENSION_STEP) *
        NAI_DIMENSION_STEP,
    ),
    height: Math.max(
      NAI_MIN_DIMENSION,
      Math.floor((snapped.height * scale) / NAI_DIMENSION_STEP) *
        NAI_DIMENSION_STEP,
    ),
  };
}

export function adaptiveNAIImageSize(
  width: unknown,
  height: unknown,
  fallback: NAIImageSize = { width: 832, height: 1216 },
): NAIImageSize {
  return fitNAIImageSize(width, height, fallback);
}

/**
 * Resolve the requested Enhance output without silently shrinking it. This is
 * used by the 2x Enhance path so an oversized request can be stopped locally.
 */
export function resolveNAIEnhanceOutputSize(
  width: unknown,
  height: unknown,
  scale: unknown,
  fallback: NAIImageSize = { width: 832, height: 1216 },
): NAIEnhanceOutputSize {
  const parsedScale = Number(scale);
  const safeScale = Number.isFinite(parsedScale)
    ? Math.max(1, parsedScale)
    : 1;
  const output = {
    width: snapNAIDimension(Number(width) * safeScale, fallback.width),
    height: snapNAIDimension(Number(height) * safeScale, fallback.height),
  };
  return {
    ...output,
    exceedsLimit: output.width * output.height > NAI_MAX_PIXEL_AREA,
  };
}

export function isNAIDimension(value: unknown): boolean {
  const parsed = Number(value);
  return (
    Number.isInteger(parsed) &&
    parsed >= NAI_MIN_DIMENSION &&
    parsed <= NAI_MAX_DIMENSION &&
    parsed % NAI_DIMENSION_STEP === 0
  );
}

export function isNAIImageSize(size: NAIImageSize): boolean {
  return (
    isNAIDimension(size.width) &&
    isNAIDimension(size.height) &&
    size.width * size.height <= NAI_MAX_PIXEL_AREA
  );
}
