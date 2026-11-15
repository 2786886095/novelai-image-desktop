import { describe, expect, it } from "vitest";
import { nextGenerationRecord, textJobRecord, type GenerationSnapshot } from "./task-tracker";

const idle: GenerationSnapshot = {
  isGenerating: false, runId: null, surface: "generate:t2i", phase: "idle", paused: false,
  queueLength: 0, progress: null, preview: null, statusText: "", lastError: "",
};

function run(patch: Partial<GenerationSnapshot>): GenerationSnapshot {
  return { ...idle, isGenerating: true, runId: "r1", phase: "requesting", progress: { done: 0, failed: 0, total: 4 }, ...patch };
}

describe("task tracker", () => {
  it("starts a running record with step and count", () => {
    const record = nextGenerationRecord(null, idle, run({}), false, 1000)!;
    expect(record).toMatchObject({ state: "running", step: "requesting", done: 0, total: 4, waiting: 3, startedAt: 1000, updatedAt: 1000 });
  });

  it("only bumps the update time when something visible changes", () => {
    const a = nextGenerationRecord(null, idle, run({}), false, 1000)!;
    const same = nextGenerationRecord(a, run({}), run({}), false, 5000)!;
    expect(same.updatedAt).toBe(1000);
    const progressed = nextGenerationRecord(a, run({}), run({ phase: "streaming", preview: { progress: 0.5, currentStep: 14, totalSteps: 28 } }), false, 6000)!;
    expect(progressed).toMatchObject({ step: "streaming", sampleProgress: 0.5, currentStep: 14, updatedAt: 6000 });
  });

  it("shows paused distinctly", () => {
    const a = nextGenerationRecord(null, idle, run({}), false, 1000)!;
    expect(nextGenerationRecord(a, run({}), run({ paused: true }), false, 2000)!.state).toBe("paused");
  });

  it("marks completion, failure and cancellation differently and keeps saved counts", () => {
    const a = nextGenerationRecord(null, idle, run({ progress: { done: 2, failed: 0, total: 4 } }), false, 1000)!;
    const done = nextGenerationRecord(a, run({}), { ...idle, progress: { done: 4, failed: 0, total: 4 }, statusText: "ok" }, false, 2000)!;
    expect(done).toMatchObject({ state: "done", done: 4, step: "finished", finishedAt: 2000 });

    const failed = nextGenerationRecord(a, run({}), { ...idle, progress: { done: 2, failed: 2, total: 4 }, lastError: "HTTP 500" }, false, 2000)!;
    expect(failed).toMatchObject({ state: "failed", done: 2, failed: 2 });

    // Cancel clears queueProgress in the store; the last observed count stays.
    const cancelled = nextGenerationRecord(a, run({}), { ...idle, progress: null, statusText: "stopped" }, true, 2000)!;
    expect(cancelled).toMatchObject({ state: "cancelled", done: 2 });
  });

  it("mirrors reverse/convert jobs", () => {
    const running = textJobRecord("reverse", { id: "j", label: "img.png", mode: "tags", knownCharacter: false, status: "processing", addedAt: 10 }, undefined, 100);
    expect(running).toMatchObject({ state: "running", step: "processing", startedAt: 10 });
    const failed = textJobRecord("reverse", { id: "j", label: "img.png", mode: "tags", knownCharacter: false, status: "failed", message: "timeout", addedAt: 10 }, running, 200);
    expect(failed).toMatchObject({ state: "failed", finishedAt: 200, updatedAt: 200, message: "timeout" });
  });
});
