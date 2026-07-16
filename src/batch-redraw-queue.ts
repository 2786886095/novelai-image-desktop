import type { BatchRedrawItem, GenerateFailureKind } from "./types";

/** Cancellation is a queue-control result, never an image-generation failure. */
export function shouldStopBatchRedraw(
  cancelRequested: boolean,
  failureKind?: GenerateFailureKind,
): boolean {
  return cancelRequested || failureKind === "cancelled";
}

/** Put an interrupted item back into the retryable state without a false error. */
export function resetInterruptedBatchItem(item: BatchRedrawItem): BatchRedrawItem {
  if (item.status !== "generating") return item;
  return {
    ...item,
    status: "pending",
    error: undefined,
    resultUrl: undefined,
    resultPath: undefined,
    historyItemId: undefined,
  };
}
