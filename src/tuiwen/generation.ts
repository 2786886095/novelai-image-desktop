import type { ComicReferenceAsset, GenerateParams, GenerateResult, HistoryItem, TuiwenProject, TuiwenShot } from "../types";

export interface TuiwenReferenceCostCounts {
  supportsPrecise: boolean;
  vibeCount: number;
  preciseCount: number;
}

export interface TuiwenGenerationQuoteGroup {
  key: string;
  shot: TuiwenShot;
  shotIds: string[];
  params: GenerateParams;
  vibeCount: number;
  preciseCount: number;
}

export function isTuiwenShotGeneratable(shot: TuiwenShot) {
  return shot.status !== "done" && Boolean(shot.enPrompt.trim() || shot.cnPrompt.trim());
}

export function getTuiwenPendingGenerationShots(project: TuiwenProject) {
  return [...project.panels].sort((a, b) => a.index - b.index).filter(isTuiwenShotGeneratable);
}

export function countTuiwenGenerationReferences(references: ComicReferenceAsset[], model: string): TuiwenReferenceCostCounts {
  const usableRefs = references.filter((ref) => ref.base64 && ref.useForGeneration !== false);
  const vibeKindCount = usableRefs.filter((ref) => ref.kind === "vibe").length;
  const preciseKindCount = usableRefs.length - vibeKindCount;
  const supportsPrecise = model.includes("4-5");
  return {
    supportsPrecise,
    vibeCount: supportsPrecise ? vibeKindCount : vibeKindCount + preciseKindCount,
    preciseCount: supportsPrecise ? preciseKindCount : 0,
  };
}

export function makeTuiwenQuoteGroupKey(params: GenerateParams, counts: TuiwenReferenceCostCounts) {
  return JSON.stringify({
    model: params.model,
    width: params.width,
    height: params.height,
    steps: params.steps,
    sampler: params.sampler,
    smea: params.smea,
    smeaDyn: params.smeaDyn,
    vibeCount: counts.vibeCount,
    preciseCount: counts.preciseCount,
  });
}

export function buildTuiwenQuoteGroups(
  project: TuiwenProject,
  targets: TuiwenShot[],
  resolveParams: (shot: TuiwenShot) => GenerateParams,
) {
  const groups = new Map<string, TuiwenGenerationQuoteGroup>();
  for (const shot of targets) {
    const params = resolveParams(shot);
    const counts = countTuiwenGenerationReferences(project.references, params.model);
    const key = makeTuiwenQuoteGroupKey(params, counts);
    const group = groups.get(key);
    if (group) {
      group.shotIds.push(shot.id);
    } else {
      groups.set(key, {
        key,
        shot,
        shotIds: [shot.id],
        params,
        vibeCount: counts.vibeCount,
        preciseCount: counts.preciseCount,
      });
    }
  }
  return [...groups.values()];
}

function roundAnlas(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function distributeTuiwenGroupAnlas(amount: number, shotIds: string[]) {
  if (!Number.isFinite(amount) || !shotIds.length) return {};
  const perShot = roundAnlas(amount / shotIds.length);
  return Object.fromEntries(shotIds.map((id) => [id, perShot])) as Record<string, number>;
}

export function resolveTuiwenActualAnlas(beforeBalance?: number, afterBalance?: number, fallback?: number) {
  if (Number.isFinite(beforeBalance) && Number.isFinite(afterBalance)) {
    const spent = roundAnlas(Number(beforeBalance) - Number(afterBalance));
    if (spent >= 0) return spent;
  }
  return fallback;
}

export function applyTuiwenGenerationResultToShot(
  shot: TuiwenShot,
  result: GenerateResult,
  item: HistoryItem | undefined,
  actualAnlas?: number,
): TuiwenShot {
  const ok = result.ok && Boolean(item);
  return {
    ...shot,
    status: ok ? "done" : "failed",
    historyItemId: item?.id ?? shot.historyItemId,
    outputPath: item?.filePath ?? shot.outputPath,
    outputUrl: item?.fileUrl ?? shot.outputUrl,
    actualAnlas: ok ? (actualAnlas ?? shot.actualAnlas) : shot.actualAnlas,
    error: ok ? undefined : result.message,
  };
}
