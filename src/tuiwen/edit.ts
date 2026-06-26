import type { TuiwenShot } from "../types";

export function reindexTuiwenShots(shots: readonly TuiwenShot[]) {
  return shots.map((shot, index) => ({ ...shot, index: index + 1 }));
}

export function insertTuiwenShotAfter(
  shots: readonly TuiwenShot[],
  sourceId: string | null,
  inserted: TuiwenShot,
) {
  const next = [...shots].sort((a, b) => a.index - b.index);
  const sourceIndex = sourceId ? next.findIndex((shot) => shot.id === sourceId) : next.length - 1;
  next.splice(Math.max(0, sourceIndex + 1), 0, inserted);
  return reindexTuiwenShots(next);
}

export function moveTuiwenShot(shots: readonly TuiwenShot[], shotId: string, direction: -1 | 1) {
  const next = [...shots].sort((a, b) => a.index - b.index);
  const sourceIndex = next.findIndex((shot) => shot.id === shotId);
  const targetIndex = sourceIndex + direction;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= next.length) return reindexTuiwenShots(next);
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return reindexTuiwenShots(next);
}

export function mergeTuiwenShotWithNext(shots: readonly TuiwenShot[], shotId: string) {
  const next = [...shots].sort((a, b) => a.index - b.index);
  const index = next.findIndex((shot) => shot.id === shotId);
  const first = next[index];
  const second = next[index + 1];
  if (!first || !second) return reindexTuiwenShots(next);
  const narration = [first.narration.trim(), second.narration.trim()].filter(Boolean).join("\n");
  const cnPrompt = [first.cnPrompt.trim(), second.cnPrompt.trim()].filter(Boolean).join("；");
  const enPrompt = [first.enPrompt.trim(), second.enPrompt.trim()].filter(Boolean).join(", ");
  const merged: TuiwenShot = {
    ...first,
    narration,
    cnPrompt,
    enPrompt,
    contextSummary: [first.contextSummary.trim(), second.contextSummary.trim()].filter(Boolean).join("；").slice(0, 240),
    startMs: first.startMs ?? second.startMs,
    durationMs: first.durationMs + second.durationMs,
    subtitle: { ...first.subtitle, text: narration },
    transition: second.transition ? { ...second.transition } : first.transition,
    status: enPrompt ? "converted" : "draft",
    historyItemId: undefined,
    outputPath: undefined,
    outputUrl: undefined,
    actualAnlas: undefined,
    audio: undefined,
    error: undefined,
  };
  next.splice(index, 2, merged);
  return reindexTuiwenShots(next);
}

export function removeTuiwenShot(shots: readonly TuiwenShot[], shotId: string) {
  return reindexTuiwenShots(
    [...shots].sort((a, b) => a.index - b.index).filter((shot) => shot.id !== shotId),
  );
}
