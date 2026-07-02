import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function stubNaiDesktop(overrides: Record<string, unknown> = {}) {
  const naiDesktop = {
    reversePrompt: vi.fn(),
    convertPrompt: vi.fn(),
    addConvertHistoryItem: vi.fn().mockResolvedValue({ ok: true }),
    deleteConvertHistoryItem: vi.fn().mockResolvedValue({ ok: true }),
    clearConvertHistory: vi.fn().mockResolvedValue({ ok: true }),
    getConvertHistory: vi.fn().mockResolvedValue([]),
    addReverseHistoryItem: vi.fn().mockResolvedValue({ ok: true }),
    deleteReverseHistoryItem: vi.fn().mockResolvedValue({ ok: true }),
    clearReverseHistory: vi.fn().mockResolvedValue({ ok: true }),
    getReverseHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  vi.stubGlobal("window", { naiDesktop });
  return naiDesktop;
}

describe("convert/反推 job tracker (concurrent, not a serial queue)", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it("runs two convert submissions concurrently instead of blocking the second", async () => {
    const first = deferred<{ ok: boolean; result: string }>();
    const second = deferred<{ ok: boolean; result: string }>();
    const convertPrompt = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    stubNaiDesktop({ convertPrompt });

    useAppStore.setState({ convertInput: "第一段描述" });
    const runningFirst = useAppStore.getState().runConvertPrompt();
    await vi.waitFor(() => expect(convertPrompt).toHaveBeenCalledTimes(1));

    // The button never disables, so a second submission can start while the
    // first is still in flight — this is the whole point of the tracker.
    useAppStore.setState({ convertInput: "第二段描述" });
    const runningSecond = useAppStore.getState().runConvertPrompt();
    await vi.waitFor(() => expect(convertPrompt).toHaveBeenCalledTimes(2));

    expect(useAppStore.getState().convertJobs).toHaveLength(2);
    expect(useAppStore.getState().convertJobs.every((job) => job.status === "processing")).toBe(true);

    first.resolve({ ok: true, result: "1girl, solo" });
    await runningFirst;
    expect(useAppStore.getState().convertJobs.find((j) => j.label === "第一段描述")?.status).toBe("done");
    expect(useAppStore.getState().convertJobs.find((j) => j.label === "第二段描述")?.status).toBe("processing");

    second.resolve({ ok: true, result: "1boy, solo" });
    await runningSecond;
    expect(useAppStore.getState().convertJobs.every((job) => job.status === "done")).toBe(true);
    expect(useAppStore.getState().convertHistory).toHaveLength(2);
  });

  it("marks a failed convert job without adding a history entry", async () => {
    const convertPrompt = vi.fn().mockResolvedValue({ ok: false, message: "API 出错了" });
    stubNaiDesktop({ convertPrompt });
    useAppStore.setState({ convertInput: "坏掉的请求" });

    await useAppStore.getState().runConvertPrompt();

    const job = useAppStore.getState().convertJobs[0];
    expect(job.status).toBe("failed");
    expect(job.message).toBe("API 出错了");
    expect(useAppStore.getState().convertHistory).toHaveLength(0);
  });

  it("persists a reverse history item with the source image path for later prune checks", async () => {
    const reversePrompt = vi.fn().mockResolvedValue({
      ok: true,
      prompt: "1girl, blue hair",
      variants: undefined,
    });
    const naiDesktop = stubNaiDesktop({ reversePrompt });
    useAppStore.setState({
      inspectImageBase64: "base64data",
      inspectImagePath: "C:\\Users\\me\\Pictures\\ref.png",
      reversePromptHint: "hint text",
    });

    await useAppStore.getState().runReversePrompt();

    expect(useAppStore.getState().reverseHistory).toHaveLength(1);
    expect(useAppStore.getState().reverseHistory[0].sourceImagePath).toBe("C:\\Users\\me\\Pictures\\ref.png");
    expect(naiDesktop.addReverseHistoryItem).toHaveBeenCalledTimes(1);
  });

  it("removes a finished job from the tracker without touching history", () => {
    useAppStore.setState({
      convertJobs: [
        { id: "a", label: "done job", mode: "tags", knownCharacter: false, status: "done", result: "x", addedAt: Date.now() },
      ],
      convertHistory: [
        { id: "a", mode: "tags", knownCharacter: false, input: "x", result: "x", createdAt: new Date().toISOString() },
      ],
    });

    useAppStore.getState().removeConvertJob("a");

    expect(useAppStore.getState().convertJobs).toHaveLength(0);
    expect(useAppStore.getState().convertHistory).toHaveLength(1);
  });

  it("deletes and clears convert history through the persistence bridge", async () => {
    const naiDesktop = stubNaiDesktop();
    useAppStore.setState({
      convertHistory: [
        { id: "a", mode: "tags", knownCharacter: false, input: "x", result: "x", createdAt: new Date().toISOString() },
        { id: "b", mode: "tags", knownCharacter: false, input: "y", result: "y", createdAt: new Date().toISOString() },
      ],
    });

    await useAppStore.getState().deleteConvertHistoryItem("a");
    expect(useAppStore.getState().convertHistory).toHaveLength(1);
    expect(naiDesktop.deleteConvertHistoryItem).toHaveBeenCalledWith("a");

    await useAppStore.getState().clearConvertHistory();
    expect(useAppStore.getState().convertHistory).toHaveLength(0);
    expect(naiDesktop.clearConvertHistory).toHaveBeenCalledTimes(1);
  });

  it("treats removing an in-flight job as cancellation: no result, no history entry", async () => {
    const pending = deferred<{ ok: boolean; result: string }>();
    const convertPrompt = vi.fn().mockImplementationOnce(() => pending.promise);
    stubNaiDesktop({ convertPrompt });
    useAppStore.setState({ convertInput: "会被取消的请求" });

    const running = useAppStore.getState().runConvertPrompt();
    await vi.waitFor(() => expect(convertPrompt).toHaveBeenCalledTimes(1));
    const jobId = useAppStore.getState().convertJobs[0].id;

    // User clicks the ✕ on the still-processing job — this is "cancel".
    useAppStore.getState().removeConvertJob(jobId);
    expect(useAppStore.getState().convertJobs).toHaveLength(0);

    // The underlying request keeps running and eventually succeeds, but since
    // its job is gone from the tracker the result must be fully discarded.
    pending.resolve({ ok: true, result: "1girl, solo" });
    await running;

    expect(useAppStore.getState().convertResult).toBe("");
    expect(useAppStore.getState().convertHistory).toHaveLength(0);
  });

  it("auto-dismisses a done job from the tracker shortly after it finishes, without touching history", async () => {
    vi.useFakeTimers();
    try {
      const convertPrompt = vi.fn().mockResolvedValue({ ok: true, result: "1girl, solo" });
      stubNaiDesktop({ convertPrompt });
      useAppStore.setState({ convertInput: "应该自动消失" });

      await useAppStore.getState().runConvertPrompt();
      expect(useAppStore.getState().convertJobs).toHaveLength(1);
      expect(useAppStore.getState().convertJobs[0].status).toBe("done");

      await vi.advanceTimersByTimeAsync(1500);
      expect(useAppStore.getState().convertJobs).toHaveLength(0);
      expect(useAppStore.getState().convertHistory).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
