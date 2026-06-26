import type { GenerateParams, TuiwenAspectRatio, TuiwenExportSettings } from "../types";

export const TUIWEN_CANVAS_PRESETS: Record<TuiwenAspectRatio, { width: number; height: number; label: string }> = {
  "9:16": { width: 1080, height: 1920, label: "竖屏 9:16" },
  "16:9": { width: 1920, height: 1080, label: "横屏 16:9" },
  "1:1": { width: 1080, height: 1080, label: "方屏 1:1" },
  "4:3": { width: 1440, height: 1080, label: "横版 4:3" },
  "3:4": { width: 1080, height: 1440, label: "竖版 3:4" },
};

export interface TuiwenAspectPlan {
  aspectRatio: TuiwenAspectRatio;
  canvas: { width: number; height: number; aspect: number };
  nai: { width: number; height: number; aspect: number; pixels: number };
  cover: {
    scaleToCover: number;
    renderedWidth: number;
    renderedHeight: number;
    cropX: number;
    cropY: number;
    recommendedKenBurnsScale: number;
  };
  opusFreeWarning: string | null;
}

const NAI_DIMENSION_STEP = 64;
const NAI_MIN_DIMENSION = 512;
const NAI_MAX_DIMENSION = 1536;
const OPUS_FREE_MAX_PIXELS = 1024 * 1024;
const OPUS_FREE_MAX_STEPS = 28;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function candidateScore(width: number, height: number, targetAspect: number, maxPixels: number) {
  const aspect = width / height;
  const aspectPenalty = Math.abs(Math.log(aspect / targetAspect));
  const pixelFill = (width * height) / maxPixels;
  // Ratio match matters most; among close matches prefer more pixels so the
  // export has enough room for scale-to-cover and Ken Burns over-scan.
  return aspectPenalty * 100 - pixelFill;
}

export function chooseTuiwenNaiSize(aspectRatio: TuiwenAspectRatio, maxPixels = OPUS_FREE_MAX_PIXELS) {
  const target = TUIWEN_CANVAS_PRESETS[aspectRatio];
  const targetAspect = target.width / target.height;
  let best = { width: 1024, height: 1024, score: Number.POSITIVE_INFINITY };
  for (let width = NAI_MIN_DIMENSION; width <= NAI_MAX_DIMENSION; width += NAI_DIMENSION_STEP) {
    for (let height = NAI_MIN_DIMENSION; height <= NAI_MAX_DIMENSION; height += NAI_DIMENSION_STEP) {
      const pixels = width * height;
      if (pixels > maxPixels) continue;
      const orientationMismatch =
        (targetAspect > 1 && width < height) ||
        (targetAspect < 1 && width > height);
      if (orientationMismatch) continue;
      const score = candidateScore(width, height, targetAspect, maxPixels);
      if (score < best.score) best = { width, height, score };
    }
  }
  return { width: best.width, height: best.height };
}

export function buildTuiwenAspectPlan(
  settings: Pick<TuiwenExportSettings, "aspectRatio" | "width" | "height">,
  params?: Pick<GenerateParams, "steps" | "width" | "height">,
): TuiwenAspectPlan {
  const preset = TUIWEN_CANVAS_PRESETS[settings.aspectRatio];
  const canvasWidth = settings.width || preset.width;
  const canvasHeight = settings.height || preset.height;
  const naiSize = params?.width && params?.height
    ? { width: params.width, height: params.height }
    : chooseTuiwenNaiSize(settings.aspectRatio);
  const canvasAspect = canvasWidth / canvasHeight;
  const naiAspect = naiSize.width / naiSize.height;
  const scaleToCover = Math.max(canvasWidth / naiSize.width, canvasHeight / naiSize.height);
  const renderedWidth = naiSize.width * scaleToCover;
  const renderedHeight = naiSize.height * scaleToCover;
  const cropX = Math.max(0, (renderedWidth - canvasWidth) / 2);
  const cropY = Math.max(0, (renderedHeight - canvasHeight) / 2);
  const pixels = naiSize.width * naiSize.height;
  const steps = params?.steps ?? OPUS_FREE_MAX_STEPS;
  const opusFreeWarning =
    pixels <= OPUS_FREE_MAX_PIXELS && steps <= OPUS_FREE_MAX_STEPS
      ? null
      : `当前尺寸/步数会越过 Opus 免费线：${naiSize.width}×${naiSize.height}，${steps} 步。`;

  return {
    aspectRatio: settings.aspectRatio,
    canvas: { width: canvasWidth, height: canvasHeight, aspect: canvasAspect },
    nai: { width: naiSize.width, height: naiSize.height, aspect: naiAspect, pixels },
    cover: {
      scaleToCover: round2(scaleToCover),
      renderedWidth: Math.round(renderedWidth),
      renderedHeight: Math.round(renderedHeight),
      cropX: Math.round(cropX),
      cropY: Math.round(cropY),
      recommendedKenBurnsScale: round2(Math.max(1.08, scaleToCover * 1.03)),
    },
    opusFreeWarning,
  };
}

export function applyTuiwenAspectToParams(params: GenerateParams, aspectRatio: TuiwenAspectRatio): GenerateParams {
  const size = chooseTuiwenNaiSize(aspectRatio);
  return { ...params, width: size.width, height: size.height };
}
