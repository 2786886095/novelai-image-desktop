import { create } from "zustand";
import type { CanvasSurface, GenerationPhase } from "../store";
import type { TextToolJob } from "../types";

export type TaskState = "waiting" | "running" | "paused" | "done" | "failed" | "cancelled";
export type TaskKind = "generate" | "i2i" | "enhance" | "inpaint" | "upscale" | "director" | "batchRedraw" | "reverse" | "convert";
export type TaskStep = GenerationPhase | "queued" | "processing" | "finished";

export type TaskRecord = {
  id: string;
  kind: TaskKind;
  state: TaskState;
  step: TaskStep;
  label?: string;
  done: number;
  failed: number;
  total: number;
  /** Sampling progress of the current image (0..1) when the service streams it. */
  sampleProgress?: number;
  currentStep?: number;
  totalSteps?: number;
  waiting: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  message?: string;
};

/** Snapshot of the generation-related app state the tracker observes. */
export type GenerationSnapshot = {
  isGenerating: boolean;
  runId: string | null;
  surface: CanvasSurface;
  phase: GenerationPhase;
  paused: boolean;
  queueLength: number;
  progress: { done: number; failed: number; total: number } | null;
  preview: { progress: number; currentStep?: number; totalSteps?: number } | null;
  statusText: string;
  lastError: string;
};

export function kindForSurface(surface: CanvasSurface): TaskKind {
  switch (surface) {
    case "generate:i2i": return "i2i";
    case "generate:enhance": return "enhance";
    case "inpaint": return "inpaint";
    case "postprocess:upscale": return "upscale";
    case "postprocess:director": return "director";
    default: return "generate";
  }
}

/** Pure transition used by the live subscription (unit tested). */
export function nextGenerationRecord(
  previous: TaskRecord | null,
  before: GenerationSnapshot | null,
  now: GenerationSnapshot,
  cancelRequested: boolean,
  clock: number,
): TaskRecord | null {
  const wasRunning = Boolean(before?.isGenerating);
  if (now.isGenerating) {
    const fresh = !wasRunning || !previous || previous.state === "done" || previous.state === "failed" || previous.state === "cancelled";
    const base: TaskRecord = fresh
      ? { id: now.runId ?? `run-${clock}`, kind: kindForSurface(now.surface), state: "running", step: now.phase, done: 0, failed: 0, total: 1, waiting: 0, startedAt: clock, updatedAt: clock }
      : { ...previous! };
    const progress = now.progress;
    const done = progress?.done ?? 0;
    const failed = progress?.failed ?? 0;
    const total = Math.max(Math.max(progress?.total ?? 1, 1) + (progress ? 0 : now.queueLength), done + failed);
    const next: TaskRecord = {
      ...base,
      state: now.paused ? "paused" : "running",
      step: now.phase === "idle" ? "preparing" : now.phase,
      done,
      failed,
      total,
      waiting: Math.max(0, total - done - failed - 1),
      sampleProgress: now.preview?.progress,
      currentStep: now.preview?.currentStep,
      totalSteps: now.preview?.totalSteps,
      message: now.statusText || base.message,
    };
    const changed = fresh || ["state", "step", "done", "failed", "total", "waiting", "sampleProgress", "currentStep", "message"]
      .some((key) => (next as Record<string, unknown>)[key] !== (base as Record<string, unknown>)[key]);
    return changed ? { ...next, updatedAt: clock } : base;
  }
  if (wasRunning && previous && (previous.state === "running" || previous.state === "paused")) {
    // Cancel resets queueProgress; keep the last observed counts so the user
    // still sees how many images were already saved before stopping.
    const state: TaskState = cancelRequested ? "cancelled" : now.lastError ? "failed" : "done";
    const done = now.progress?.done ?? previous.done;
    const failed = now.progress?.failed ?? previous.failed;
    return {
      ...previous,
      state,
      step: "finished",
      done: state === "done" && !now.progress ? Math.max(done, 1) : done,
      failed,
      waiting: 0,
      sampleProgress: undefined,
      message: now.statusText || now.lastError || previous.message,
      updatedAt: clock,
      finishedAt: clock,
    };
  }
  return previous;
}

export function textJobRecord(kind: "reverse" | "convert", job: TextToolJob, previous: TaskRecord | undefined, clock: number): TaskRecord {
  const state: TaskState = job.status === "processing" ? "running" : job.status === "failed" ? "failed" : "done";
  const changed = !previous || previous.state !== state || previous.message !== job.message;
  return {
    id: `${kind}:${job.id}`,
    kind,
    state,
    step: state === "running" ? "processing" : "finished",
    label: job.label,
    done: state === "done" ? 1 : 0,
    failed: state === "failed" ? 1 : 0,
    total: 1,
    waiting: 0,
    startedAt: previous?.startedAt ?? job.addedAt ?? clock,
    updatedAt: changed ? clock : previous!.updatedAt,
    finishedAt: state === "running" ? undefined : previous?.finishedAt ?? clock,
    message: job.message,
  };
}

type TaskStore = {
  generation: TaskRecord | null;
  batch: TaskRecord | null;
  textJobs: Record<string, TaskRecord>;
  recent: TaskRecord[];
  dismissRecent: () => void;
};

export const useTaskStore = create<TaskStore>((set) => ({
  generation: null,
  batch: null,
  textJobs: {},
  recent: [],
  dismissRecent: () => set({ recent: [] }),
}));

export function isActive(record: TaskRecord | null | undefined) {
  return Boolean(record && (record.state === "running" || record.state === "paused" || record.state === "waiting"));
}

export function activeTaskCount(state: Pick<TaskStore, "generation" | "batch" | "textJobs">) {
  return [state.generation, state.batch, ...Object.values(state.textJobs)].filter(isActive).length;
}

function pushRecent(recent: TaskRecord[], record: TaskRecord) {
  return [record, ...recent.filter((item) => item.id !== record.id)].slice(0, 8);
}

type StoreLike = {
  getState: () => any;
  setState: (partial: any) => void;
  subscribe: (listener: (state: any, previous: any) => void) => () => void;
};

let installed = false;

/** Observe the app store without changing any generation, billing or cancel
 *  behaviour; the original cancel implementation is still the one invoked. */
export function installTaskTracker(store: StoreLike) {
  if (installed) return;
  installed = true;
  let cancelRequested = false;
  const originalCancel = store.getState().cancel as () => Promise<void>;
  store.setState({
    cancel: async () => {
      if (store.getState().isGenerating) cancelRequested = true;
      return originalCancel();
    },
  });
  const snapshot = (state: any): GenerationSnapshot => ({
    isGenerating: Boolean(state.isGenerating),
    runId: state.activeGenerationRunId ?? null,
    surface: state.activeCanvasSurface,
    phase: state.generationPhase,
    paused: Boolean(state.queuePaused),
    queueLength: state.generationQueue?.length ?? 0,
    progress: state.queueProgress ?? null,
    preview: state.generationPreview ? {
      progress: state.generationPreview.progress,
      currentStep: state.generationPreview.currentStep,
      totalSteps: state.generationPreview.totalSteps,
    } : null,
    statusText: String(state.statusText ?? ""),
    lastError: String(state.lastError ?? ""),
  });
  let before: GenerationSnapshot | null = null;
  let settle: { id: string; spent: number | null } | null = null;
  const sync = (state: any) => {
    const now = snapshot(state);
    const clock = Date.now();
    const tasks = useTaskStore.getState();
    let nextGeneration = nextGenerationRecord(tasks.generation, before, now, cancelRequested, clock);
    if (nextGeneration?.finishedAt && !tasks.generation?.finishedAt) settle = { id: nextGeneration.id, spent: state.lastAnlasSpent ?? null };
    // The final status text settles shortly after a run ends: the exact spend
    // arrives with lastAnlasSpent, and a cancel is confirmed once the native
    // cancel resolves. Follow only those signals, never unrelated later text.
    if (!now.isGenerating && nextGeneration?.finishedAt && settle?.id === nextGeneration.id && now.statusText && now.statusText !== nextGeneration.message) {
      const age = clock - nextGeneration.finishedAt;
      const spendSettled = (state.lastAnlasSpent ?? null) !== settle.spent && age < 20_000;
      const cancelSettled = nextGeneration.state === "cancelled" && age < 5_000;
      if (spendSettled || cancelSettled) nextGeneration = { ...nextGeneration, message: now.statusText };
      if (spendSettled) settle = null;
    }
    if (!now.isGenerating) cancelRequested = false;
    before = now;
    let recent = tasks.recent;
    if (nextGeneration && nextGeneration !== tasks.generation && nextGeneration.finishedAt) {
      recent = pushRecent(recent, nextGeneration);
    }

    // Batch img2img (tools) — progress is { done, total }.
    let batch = tasks.batch;
    if (state.batchRunning) {
      const progress = state.batchProgress ?? { done: 0, total: 0 };
      const fresh = !batch || !isActive(batch);
      const step: TaskStep = state.batchCancelRequested ? "saving" : "requesting";
      if (fresh || batch!.done !== progress.done || batch!.total !== progress.total || batch!.step !== step) {
        batch = {
          ...(fresh ? { id: `batch-${clock}`, kind: "batchRedraw" as const, startedAt: clock, failed: 0 } : batch!),
          state: "running", step, done: progress.done, total: Math.max(progress.total, 1),
          waiting: Math.max(0, progress.total - progress.done - 1), updatedAt: clock,
        } as TaskRecord;
      }
    } else if (batch && isActive(batch)) {
      batch = { ...batch, state: state.batchCancelRequested || batch.done < batch.total ? "cancelled" : "done", step: "finished", waiting: 0, updatedAt: clock, finishedAt: clock };
      recent = pushRecent(recent, batch);
    }

    // Reverse / convert jobs run concurrently; mirror them one to one.
    const textJobs: Record<string, TaskRecord> = {};
    for (const [kind, jobs] of [["reverse", state.reverseJobs], ["convert", state.convertJobs]] as const) {
      for (const job of (jobs ?? []) as TextToolJob[]) {
        const id = `${kind}:${job.id}`;
        const record = textJobRecord(kind, job, tasks.textJobs[id], clock);
        textJobs[id] = record;
        if (record.finishedAt && !tasks.textJobs[id]?.finishedAt && tasks.textJobs[id]) recent = pushRecent(recent, record);
      }
    }
    const sameText = Object.keys(textJobs).length === Object.keys(tasks.textJobs).length
      && Object.entries(textJobs).every(([id, record]) => tasks.textJobs[id] && tasks.textJobs[id].updatedAt === record.updatedAt && tasks.textJobs[id].state === record.state);
    if (nextGeneration === tasks.generation && batch === tasks.batch && sameText && recent === tasks.recent) return;
    useTaskStore.setState({ generation: nextGeneration, batch, textJobs: sameText ? tasks.textJobs : textJobs, recent });
  };
  store.subscribe((state) => sync(state));
  sync(store.getState());
}
