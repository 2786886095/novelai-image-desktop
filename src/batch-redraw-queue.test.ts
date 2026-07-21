import { describe, expect, it } from "vitest";
import {
  clearBatchRedrawItemResult,
  resetInterruptedBatchItem,
  shouldStopBatchRedraw,
} from "./batch-redraw-queue";
import type { BatchRedrawItem } from "./types";

function item(status: BatchRedrawItem["status"]): BatchRedrawItem {
  return {
    id: "item-1",
    name: "source",
    base64: "YWJj",
    prompt: "redraw",
    strength: null,
    overrideParams: false,
    params: {},
    status,
    error: status === "generating" ? "Operation cancelled" : undefined,
  };
}

describe("batch redraw cancellation", () => {
  it("stops for either the global queue flag or a cancelled IPC result", () => {
    expect(shouldStopBatchRedraw(true, "api")).toBe(true);
    expect(shouldStopBatchRedraw(false, "cancelled")).toBe(true);
    expect(shouldStopBatchRedraw(false, "api")).toBe(false);
  });

  it("returns the interrupted image to pending instead of failed", () => {
    expect(resetInterruptedBatchItem(item("generating"))).toMatchObject({
      status: "pending",
      error: undefined,
    });
    expect(resetInterruptedBatchItem(item("done")).status).toBe("done");
  });

  it("clears a previous result without changing the source inputs", () => {
    const source = {
      ...item("done"),
      prompt: "keep this prompt",
      resultUrl: "file:///result.png",
      resultPath: "C:/output/result.png",
      historyItemId: "history-1",
    };
    expect(clearBatchRedrawItemResult(source)).toMatchObject({
      prompt: "keep this prompt",
      status: "pending",
      error: undefined,
      resultUrl: undefined,
      resultPath: undefined,
      historyItemId: undefined,
    });
  });
});
