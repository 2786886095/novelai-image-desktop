import type {
  BatchRedrawItem,
  BatchRedrawProject,
  BatchRedrawRequest,
  GenerateFailureKind,
  GenerateParams,
} from "./types";

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
  const positivePrompt = [project.globalStyle.trim(), item.prompt.trim()]
    .filter(Boolean)
    .join(", ");

  return {
    imageBase64: item.base64,
    params: {
      ...base,
      positivePrompt,
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
    resultUrl: undefined,
    resultPath: undefined,
    historyItemId: undefined,
  };
}
