import { describe, expect, it } from "vitest";
import {
  appendBatchRedrawCandidates,
  batchRedrawCandidates,
  buildBatchRedrawRequest,
  clearBatchRedrawItemResult,
  normalizeBatchRedrawCandidateCount,
  retainBatchRedrawCandidates,
  resetBatchRedrawItemForParameterRevision,
  resetInterruptedBatchItem,
  selectBatchRedrawCandidate,
  selectedBatchRedrawCandidate,
  shouldStopBatchRedraw,
} from "./batch-redraw-queue";
import { createDefaultBatchRedraw, DEFAULT_PARAMS, type BatchRedrawItem } from "./types";

function item(status: BatchRedrawItem["status"]): BatchRedrawItem {
  return {
    id: "item-1",
    name: "source",
    base64: "YWJj",
    width: 1000,
    height: 1300,
    prompt: "redraw",
    strength: null,
    overrideParams: false,
    params: {},
    status,
    candidates: [],
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

  it("keeps an existing output visible when a replacement is cancelled", () => {
    const interrupted = resetInterruptedBatchItem({
      ...item("generating"),
      resultUrl: "file:///existing.png",
      resultPath: "C:/output/existing.png",
      historyItemId: "history-existing",
    });
    expect(interrupted).toMatchObject({
      status: "pending",
      resultUrl: "file:///existing.png",
      resultPath: "C:/output/existing.png",
      historyItemId: "history-existing",
    });
  });

  it("clamps the one shared candidate count", () => {
    expect(normalizeBatchRedrawCandidateCount(undefined)).toBe(1);
    expect(normalizeBatchRedrawCandidateCount(0)).toBe(1);
    expect(normalizeBatchRedrawCandidateCount(3.9)).toBe(3);
    expect(normalizeBatchRedrawCandidateCount(99)).toBe(8);
  });

  it("retains all candidates while changing only the selected export", () => {
    const first = {
      id: "history-1",
      historyItemId: "history-1",
      resultUrl: "file:///one.png",
      resultPath: "C:/output/one.png",
    };
    const second = {
      id: "history-2",
      historyItemId: "history-2",
      resultUrl: "file:///two.png",
      resultPath: "C:/output/two.png",
    };
    const withBoth = appendBatchRedrawCandidates(
      appendBatchRedrawCandidates(item("done"), [first]),
      [second],
    );
    expect(batchRedrawCandidates(withBoth)).toHaveLength(2);
    expect(selectedBatchRedrawCandidate(withBoth)?.id).toBe("history-1");

    const selected = selectBatchRedrawCandidate(withBoth, "history-2");
    expect(selected.candidates).toHaveLength(2);
    expect(selected.resultPath).toBe("C:/output/two.png");
    expect(selected.historyItemId).toBe("history-2");

    const retained = retainBatchRedrawCandidates(
      selected,
      new Set(["history-2"]),
    );
    expect(retained.candidates.map((candidate) => candidate.id)).toEqual([
      "history-2",
    ]);
  });

  it("snapshots the parameters and references visible when the queue starts", () => {
    const project = createDefaultBatchRedraw({ ...DEFAULT_PARAMS, steps: 28 });
    project.globalStyle = "global style";
    project.globalNegative = "new negative";
    project.globalStrength = 0.55;
    project.vibeImages = [{ base64: "vibe", infoExtracted: 0.6, strength: 0.7 }];
    project.preciseReferences = [
      { base64: "precise", type: "character", strength: 1, fidelity: 0.8 },
    ];
    const source: BatchRedrawItem = {
      ...item("pending"),
      prompt: "subject",
      overrideParams: true,
      params: { steps: 36, seed: 123, seedMode: "fixed" },
    };

    const request = buildBatchRedrawRequest(project, source, "Batch output");
    project.globalStyle = "edited after start";
    project.vibeImages[0].strength = 0.1;

    expect(request).toMatchObject({
      groupName: "Batch output",
      strength: 0.55,
      params: {
        width: 1024,
        height: 1280,
        steps: 36,
        seed: 123,
        seedMode: "fixed",
        positivePrompt: "global style, subject",
        stylePrompt: "",
        negativePrompt: "new negative",
      },
      extras: {
        vibeImages: [{ base64: "vibe", infoExtracted: 0.6, strength: 0.7 }],
        preciseReferences: [
          { base64: "precise", type: "character", strength: 1, fidelity: 0.8 },
        ],
      },
    });
    expect(request.params.positivePrompt.match(/global style/g)).toHaveLength(1);
  });

  it("uses the selected custom size for every batch item", () => {
    const project = createDefaultBatchRedraw({
      ...DEFAULT_PARAMS,
      width: 1216,
      height: 832,
    });
    project.sizeMode = "custom";

    const request = buildBatchRedrawRequest(project, item("pending"), "Batch");

    expect(request.params).toMatchObject({ width: 1216, height: 832 });
  });

  it("clears a previous result without changing the source inputs", () => {
    const source = {
      ...item("done"),
      prompt: "keep this prompt",
      resultUrl: "file:///result.png",
      resultPath: "C:/output/result.png",
      historyItemId: "history-1",
      candidates: [
        {
          id: "history-1",
          historyItemId: "history-1",
          resultUrl: "file:///result.png",
          resultPath: "C:/output/result.png",
        },
      ],
      selectedCandidateId: "history-1",
    };
    expect(clearBatchRedrawItemResult(source)).toMatchObject({
      prompt: "keep this prompt",
      status: "pending",
      error: undefined,
      resultUrl: undefined,
      resultPath: undefined,
      historyItemId: undefined,
      candidates: [],
      selectedCandidateId: undefined,
    });
  });

  it("drops stale per-image parameter snapshots for a fresh revision", () => {
    const reset = resetBatchRedrawItemForParameterRevision({
      ...item("done"),
      prompt: "keep prompt",
      strength: 0.72,
      overrideParams: true,
      params: { steps: 40, cfgScale: 9 },
      resultPath: "C:/output/result.png",
    });
    expect(reset).toMatchObject({
      prompt: "keep prompt",
      strength: 0.72,
      overrideParams: false,
      params: {},
      status: "pending",
      resultPath: undefined,
    });
  });
});
