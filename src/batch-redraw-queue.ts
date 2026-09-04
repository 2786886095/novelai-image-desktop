import type {
  BatchRedrawCandidate,
  BatchRedrawItem,
  BatchRedrawProject,
  BatchRedrawRequest,
  GenerateFailureKind,
  GenerateParams,
} from "./types";
import { adaptiveNAIImageSize, isNAIImageSize } from "./nai-dimensions";

export const MAX_BATCH_REDRAW_CANDIDATES = 8;

export function normalizeBatchRedrawCandidateCount(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(MAX_BATCH_REDRAW_CANDIDATES, Math.max(1, parsed));
}

/**
 * Read all candidates, including one legacy selected-output tuple saved by an
 * older build. The legacy conversion is deliberately lazy so an already-open
 * project survives a hot update without losing its visible result.
 */
export function batchRedrawCandidates(
  item: BatchRedrawItem,
): BatchRedrawCandidate[] {
  const candidates = Array.isArray(item.candidates)
    ? item.candidates.filter(
        (candidate) =>
          Boolean(candidate?.id) &&
          Boolean(candidate?.resultPath) &&
          Boolean(candidate?.resultUrl),
      )
    : [];
  if (candidates.length > 0) return candidates;
  if (!item.resultPath || !item.resultUrl) return [];
  const historyItemId = item.historyItemId ?? item.resultPath;
  return [
    {
      id: historyItemId,
      historyItemId,
      resultPath: item.resultPath,
      resultUrl: item.resultUrl,
    },
  ];
}

export function selectedBatchRedrawCandidate(
  item: BatchRedrawItem,
): BatchRedrawCandidate | undefined {
  const candidates = batchRedrawCandidates(item);
  return (
    candidates.find((candidate) => candidate.id === item.selectedCandidateId) ??
    candidates[0]
  );
}

function withCandidateAliases(
  item: BatchRedrawItem,
  candidates: BatchRedrawCandidate[],
  selectedCandidateId?: string,
): BatchRedrawItem {
  const selected =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates[0];
  return {
    ...item,
    candidates,
    selectedCandidateId: selected?.id,
    resultUrl: selected?.resultUrl,
    resultPath: selected?.resultPath,
    historyItemId: selected?.historyItemId,
  };
}

/** Append new alternatives without changing an existing manual selection. */
export function appendBatchRedrawCandidates(
  item: BatchRedrawItem,
  incoming: BatchRedrawCandidate[],
): BatchRedrawItem {
  const existing = batchRedrawCandidates(item);
  const seen = new Set(existing.map((candidate) => candidate.id));
  const candidates = [...existing];
  for (const candidate of incoming) {
    if (!seen.has(candidate.id)) {
      candidates.push(candidate);
      seen.add(candidate.id);
    }
  }
  const previous = selectedBatchRedrawCandidate(item);
  return withCandidateAliases(
    item,
    candidates,
    previous?.id ?? incoming[0]?.id,
  );
}

export function selectBatchRedrawCandidate(
  item: BatchRedrawItem,
  candidateId: string,
): BatchRedrawItem {
  const candidates = batchRedrawCandidates(item);
  if (!candidates.some((candidate) => candidate.id === candidateId)) return item;
  return withCandidateAliases(item, candidates, candidateId);
}

export function retainBatchRedrawCandidates(
  item: BatchRedrawItem,
  keepHistoryIds: ReadonlySet<string>,
): BatchRedrawItem {
  const candidates = batchRedrawCandidates(item).filter((candidate) =>
    keepHistoryIds.has(candidate.historyItemId),
  );
  return withCandidateAliases(item, candidates, item.selectedCandidateId);
}

/**
 * Create a self-contained redraw request from the parameters that are visible
 * when the user presses Generate.  A batch is serial, so reading the project
 * again for every item made later cards pick up edits made while the queue was
 * already running.  Keeping this builder pure also makes individual Retry use
 * the newest saved parameters while an already-started queue stays unchanged.
 */
export function buildBatchRedrawRequest(
  project: BatchRedrawProject,
  item: BatchRedrawItem,
  groupName: string,
): BatchRedrawRequest {
  const base: GenerateParams = item.overrideParams
    ? { ...project.globalParams, ...item.params }
    : { ...project.globalParams };
  const explicitSize = {
    width: item.outputWidth ?? 0,
    height: item.outputHeight ?? 0,
  };
  const outputSize = project.sizeMode === "adaptive"
    ? adaptiveNAIImageSize(item.width, item.height, base)
    : project.sizeMode === "perImage" && isNAIImageSize(explicitSize)
      ? explicitSize
      : { width: base.width, height: base.height };
  const positivePrompt = [project.globalStyle.trim(), item.prompt.trim()]
    .filter(Boolean)
    .join(", ");

  return {
    imageBase64: item.base64,
    params: {
      ...base,
      ...outputSize,
      positivePrompt,
      // globalStyle was already folded into positivePrompt above. Clearing the
      // separate field prevents generateImage from appending it a second time.
      stylePrompt: "",
      negativePrompt: project.globalNegative.trim() || base.negativePrompt,
      fileNamePrefix: item.name,
    },
    strength: item.strength ?? project.globalStrength,
    // References are mutable editor state. Copy their arrays and entries so a
    // later edit is deliberately reserved for the next run, not this queue.
    extras: {
      vibeImages: project.vibeImages.map((image) => ({ ...image })),
      charCaptions: [],
      preciseReferences: project.preciseReferences.map((image) => ({ ...image })),
    },
    groupName,
    fileNamePrefix: item.name,
  };
}

/** Cancellation is a queue-control result, never an image-generation failure. */
export function shouldStopBatchRedraw(
  cancelRequested: boolean,
  failureKind?: GenerateFailureKind,
): boolean {
  return cancelRequested || failureKind === "cancelled";
}

/** Put an interrupted item back into the retryable state without a false error. */
export function resetInterruptedBatchItem(
  item: BatchRedrawItem,
): BatchRedrawItem {
  if (item.status !== "generating") return item;
  return {
    ...item,
    status: "pending",
    error: undefined,
  };
}

/** Remove every result/error from a completed run while preserving its inputs. */
export function clearBatchRedrawItemResult(
  item: BatchRedrawItem,
): BatchRedrawItem {
  return {
    ...item,
    status: "pending",
    error: undefined,
    candidates: [],
    selectedCandidateId: undefined,
    resultUrl: undefined,
    resultPath: undefined,
    historyItemId: undefined,
  };
}

/** Start a fresh parameter revision after the user clears a completed run. */
export function resetBatchRedrawItemForParameterRevision(
  item: BatchRedrawItem,
): BatchRedrawItem {
  return {
    ...clearBatchRedrawItemResult(item),
    overrideParams: false,
    params: {},
  };
}
