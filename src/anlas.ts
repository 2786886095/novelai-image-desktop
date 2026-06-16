import type { GenerateParams } from "./types";

export interface AnlasEstimate {
  free: boolean;
  perImage: number;
  total: number;
}

const FREE_AREA = 1024 * 1024; // 1048576 px
const FREE_STEPS = 28;
const OPUS_TIER = 3;

/**
 * Estimate Anlas cost for a generation. The free-tier rule is exact (Opus
 * accounts get unlimited free generations at ≤1024×1024, ≤28 steps, no SMEA).
 * The paid number is an APPROXIMATION of NovelAI's pricing curve — the
 * authoritative amount is always whatever the account balance reflects after
 * generation. Shown with a「约」(approx.) prefix in the UI.
 */
export function estimateAnlas(
  params: GenerateParams,
  batchCount: number,
  tierLevel: number | undefined,
): AnlasEstimate {
  const area = params.width * params.height;
  const count = Math.max(1, batchCount);
  const freeEligible =
    tierLevel === OPUS_TIER && area <= FREE_AREA && params.steps <= FREE_STEPS && !params.smea;

  if (freeEligible) return { free: true, perImage: 0, total: 0 };

  // NovelAI opus pricing curve (non-SMEA baseline at 28 steps), scaled linearly
  // by step count and bumped for SMEA / SMEA DYN.
  let base = 15.266497014243718 * Math.exp((0.6326248927474729 * area) / FREE_AREA) - 15.266497014243718;
  base *= Math.max(1, params.steps) / FREE_STEPS;
  if (params.smea && params.smeaDyn) base *= 1.4;
  else if (params.smea) base *= 1.2;

  const perImage = Math.max(1, Math.ceil(base));
  return { free: false, perImage, total: perImage * count };
}
