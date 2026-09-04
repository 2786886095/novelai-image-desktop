import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeBatchIntervalSeconds, useAppStore, waitForBatchInterval } from "./store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function generationResult(id: string, seed: number) {
  return {
    ok: true,
    message: "ok",
    actualSeed: seed,
    items: [
      {
        id,
        date: "2026-06-21",
        filePath: `${id}.png`,
        actualSeed: seed,
      },
    ],
  };
}

describe("main generation queue", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("normalizes and waits for the configured batch interval without delaying zero", async () => {
    expect(normalizeBatchIntervalSeconds(-2)).toBe(0);
    expect(normalizeBatchIntervalSeconds(2.6)).toBe(3);
    expect(normalizeBatchIntervalSeconds(99999)).toBe(3600);

    const waits: number[] = [];
    await expect(waitForBatchInterval(1, () => true, async (milliseconds) => {
      waits.push(milliseconds);
    })).resolves.toBe(true);
    expect(waits).toEqual([250, 250, 250, 250]);

    waits.length = 0;
    await expect(waitForBatchInterval(0, () => true, async (milliseconds) => {
      waits.push(milliseconds);
    })).resolves.toBe(true);
    expect(waits).toEqual([]);
  });

  it("makes the batch interval cancellable between timer slices", async () => {
    let active = true;
    const waits: number[] = [];
    const completed = await waitForBatchInterval(2, () => active, async (milliseconds) => {
      waits.push(milliseconds);
      active = false;
    });

    expect(completed).toBe(false);
    expect(waits).toEqual([250]);
  });

  it("waits only between images in a multi-image generation run", async () => {
    vi.useFakeTimers();
    const generate = vi
      .fn()
      .mockResolvedValueOnce(generationResult("interval-first", 11))
      .mockResolvedValueOnce(generationResult("interval-second", 12));
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 0, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      batchCount: 2,
      batchIntervalSeconds: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.advanceTimersByTimeAsync(0);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(generate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await running;
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("exposes preparation, request, and idle phases without treating preflight as sampling", async () => {
    const account = deferred<{ hasToken: boolean; anlasBalance: number; tierName: string }>();
    const image = deferred<ReturnType<typeof generationResult>>();
    const generate = vi.fn().mockReturnValue(image.promise);
    const naiDesktop = {
      hasToken: vi
        .fn()
        .mockImplementationOnce(() => account.promise)
        .mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 0, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    expect(useAppStore.getState().generationPhase).toBe("preparing");

    account.resolve({ hasToken: true, anlasBalance: 100, tierName: "Opus" });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().generationPhase).toBe("requesting");

    image.resolve(generationResult("phase-test", 33));
    await running;
    expect(useAppStore.getState().generationPhase).toBe("idle");
    expect(useAppStore.getState().isGenerating).toBe(false);
  });

  it("keeps the decoded final stream frame visible until the saved image is decoded", async () => {
    const imageResult = deferred<any>();
    const decoded = deferred<void>();
    const item = {
      id: "stream-handoff",
      date: "2026-09-01",
      createdAt: "2026-09-01T17:48:55.000Z",
      filePath: "stream-handoff.png",
      fileUrl: "local-media://stream-handoff.png",
      params: { ...useAppStore.getState().params, positivePrompt: "1girl" },
      actualSeed: 77,
      model: "nai-diffusion-5-full",
      width: 832,
      height: 1216,
    };
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      decode = vi.fn(() => decoded.promise);
      constructor() {
        preloaders.push(this);
      }
    }
    const preloaders: MockImage[] = [];
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 0, balance: 100 }),
      generate: vi.fn().mockReturnValue(imageResult.promise),
      getHistoryDates: vi.fn().mockResolvedValue([item.date]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([item]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    vi.stubGlobal("Image", MockImage);
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(naiDesktop.generate).toHaveBeenCalledTimes(1));
    const previewUrl = "data:image/png;base64,final-stream-frame";
    useAppStore.setState({
      generationPreview: {
        requestId: useAppStore.getState().activeGenerationRunId ?? "stream-handoff",
        progress: 1,
        currentStep: 28,
        totalSteps: 28,
        sampleIndex: 0,
        imageDataUrl: previewUrl,
      },
      generationPhase: "saving",
    });
    imageResult.resolve({ ok: true, message: "ok", actualSeed: 77, items: [item] });
    await running;

    expect(useAppStore.getState().currentImage?.fileUrl).toBe(previewUrl);
    await vi.waitFor(() => expect(useAppStore.getState().history[0]?.fileUrl).toBe(previewUrl));
    const preloader = preloaders[0];
    expect(preloader?.src).toBe(item.fileUrl);

    preloader?.onload?.();
    decoded.resolve();
    await vi.waitFor(() => expect(useAppStore.getState().currentImage?.fileUrl).toBe(item.fileUrl));
    expect(useAppStore.getState().history[0]?.fileUrl).toBe(item.fileUrl);
  });

  it("keeps non-stream generation in the saving phase until the local image is decoded", async () => {
    const imageResult = deferred<any>();
    const decoded = deferred<void>();
    const item = {
      id: "nonstream-handoff",
      date: "2026-09-01",
      createdAt: "2026-09-01T18:12:21.000Z",
      filePath: "nonstream-handoff.png",
      fileUrl: "local-media://nonstream-handoff.png",
      params: { ...useAppStore.getState().params, positivePrompt: "1girl" },
      actualSeed: 88,
      model: "nai-diffusion-5-full",
      width: 832,
      height: 1216,
    };
    const previous = { ...item, id: "previous", filePath: "previous.png", fileUrl: "local-media://previous.png" };
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      decode = vi.fn(() => decoded.promise);
      constructor() {
        preloaders.push(this);
      }
    }
    const preloaders: MockImage[] = [];
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 0, balance: 100 }),
      generate: vi.fn().mockReturnValue(imageResult.promise),
      getHistoryDates: vi.fn().mockResolvedValue([item.date]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([item, previous]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    vi.stubGlobal("Image", MockImage);
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      currentImage: previous,
      history: [previous],
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(naiDesktop.generate).toHaveBeenCalledTimes(1));
    imageResult.resolve({ ok: true, message: "ok", actualSeed: 88, items: [item] });
    await vi.waitFor(() => expect(preloaders).toHaveLength(1));

    expect(useAppStore.getState().generationPhase).toBe("saving");
    expect(useAppStore.getState().isGenerating).toBe(true);
    expect(useAppStore.getState().currentImage?.id).toBe(previous.id);

    preloaders[0].onload?.();
    decoded.resolve();
    await running;

    expect(useAppStore.getState().generationPhase).toBe("idle");
    expect(useAppStore.getState().isGenerating).toBe(false);
    expect(useAppStore.getState().currentImage?.id).toBe(item.id);
    expect(useAppStore.getState().currentImage?.fileUrl).toBe(item.fileUrl);
  });

  it("snapshots a queued prompt and runs it after the active image", async () => {
    const first = deferred<ReturnType<typeof generationResult>>();
    const generate = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(generationResult("queued", 22));
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "first prompt" },
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    useAppStore.setState((state) => ({
      params: { ...state.params, positivePrompt: "queued prompt" },
    }));
    await useAppStore.getState().enqueueGeneration();
    expect(useAppStore.getState().generationQueue).toHaveLength(1);
    expect(useAppStore.getState().generationQueue[0].quotePending).toBe(false);

    first.resolve(generationResult("first", 11));
    await running;

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0].positivePrompt).toBe("first prompt");
    expect(generate.mock.calls[1][0].positivePrompt).toBe("queued prompt");
    expect(useAppStore.getState().queueProgress).toEqual({ done: 2, failed: 0, total: 2 });
    expect(useAppStore.getState().generationQueue).toHaveLength(0);
    expect(useAppStore.getState().isGenerating).toBe(false);
  });

  it("cancels the active request and clears pending queue items", async () => {
    const first = deferred<ReturnType<typeof generationResult>>();
    const generate = vi.fn().mockImplementationOnce(() => first.promise);
    const cancel = vi.fn().mockResolvedValue(undefined);
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel,
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "first prompt" },
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await useAppStore.getState().enqueueGeneration();
    expect(useAppStore.getState().generationQueue).toHaveLength(1);

    await useAppStore.getState().cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().generationQueue).toHaveLength(0);
    expect(useAppStore.getState().isGenerating).toBe(false);

    first.resolve(generationResult("first", 11));
    await running;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().generationQueue).toHaveLength(0);
  });

  it("does not let a cancelled request overwrite a newer generation", async () => {
    const oldRequest = deferred<ReturnType<typeof generationResult>>();
    const newRequest = deferred<ReturnType<typeof generationResult>>();
    const generate = vi
      .fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "old prompt" },
      batchCount: 1,
    }));

    const oldRunning = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await useAppStore.getState().cancel();

    useAppStore.setState((state) => ({
      params: { ...state.params, positivePrompt: "new prompt" },
    }));
    const newRunning = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));

    oldRequest.resolve(generationResult("old", 11));
    await oldRunning;
    expect(useAppStore.getState().isGenerating).toBe(true);
    expect(useAppStore.getState().queueProgress).toEqual({ done: 0, failed: 0, total: 1 });

    newRequest.resolve(generationResult("new", 22));
    await newRunning;
    expect(generate.mock.calls[1][0].positivePrompt).toBe("new prompt");
    expect(useAppStore.getState().isGenerating).toBe(false);
    expect(useAppStore.getState().queueProgress).toEqual({ done: 1, failed: 0, total: 1 });
  });

  it("shows an optimistic queued job immediately and removes it when 清空排队", async () => {
    const first = deferred<ReturnType<typeof generationResult>>();
    const quote = deferred<{ ok: boolean; amount: number; balance: number }>();
    const generate = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(generationResult("queued", 22));
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      // First call (generate pre-run) resolves; second (enqueue) stays pending.
      quoteAnlas: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, amount: 1, balance: 100 })
        .mockReturnValueOnce(quote.promise),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "first prompt" },
      batchCount: 1,
    }));

    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    useAppStore.setState((state) => ({ params: { ...state.params, positivePrompt: "queued prompt" } }));
    const enqueuing = useAppStore.getState().enqueueGeneration();
    expect(useAppStore.getState().generationQueue).toHaveLength(1);
    expect(useAppStore.getState().generationQueue[0].quotePending).toBe(true);
    // Clear the queue while the enqueue quote is still in flight.
    useAppStore.getState().clearQueue();
    quote.resolve({ ok: true, amount: 1, balance: 100 });
    await enqueuing;

    // The job must NOT have been added despite its quote resolving successfully.
    expect(useAppStore.getState().generationQueue).toHaveLength(0);

    first.resolve(generationResult("first", 11));
    await running;
    expect(generate).toHaveBeenCalledTimes(1); // only the initial image ran
    expect(useAppStore.getState().generationQueue).toHaveLength(0);
  });

  it("recovers the Generate button when the IPC request rejects with a Cloudflare page", async () => {
    const generate = vi.fn().mockRejectedValue(
      new Error("Error invoking remote method 'nai:generate': <html><body><h1>Bad Gateway</h1><p>Error code 502</p></body></html>"),
    );
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      generate,
      getHistoryDates: vi.fn().mockResolvedValue([]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      batchCount: 1,
    }));

    await useAppStore.getState().generate();

    const state = useAppStore.getState();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(state.isGenerating).toBe(false);
    expect(state.isGenerateQueueRunning).toBe(false);
    expect(state.activeGenerationRunId).toBeNull();
    expect(state.toast).toContain("HTTP 502 Bad Gateway");
    expect(state.toast).not.toContain("<html");
    expect(state.statusText).not.toContain("<html");
  });

  it("ignores deleted history metadata and keeps the active generation prompt snapshot", async () => {
    const metadataLoad = deferred<any>();
    const generation = deferred<ReturnType<typeof generationResult>>();
    const generate = vi.fn().mockReturnValue(generation.promise);
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      generate,
      loadImageFromPath: vi.fn().mockReturnValue(metadataLoad.promise),
      deleteHistory: vi.fn().mockResolvedValue({ ok: true }),
      getHistoryDates: vi.fn().mockResolvedValue(["2026-06-21"]),
      getHistoryGroups: vi.fn().mockResolvedValue([]),
      getHistory: vi.fn().mockResolvedValue([]),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("window", { naiDesktop });
    const deletedItem = {
      id: "deleted",
      date: "2026-06-21",
      createdAt: "2026-06-21T00:00:00.000Z",
      filePath: "deleted.png",
      fileUrl: "local-media://deleted.png",
      params: { ...useAppStore.getState().params, positivePrompt: "deleted history prompt" },
      actualSeed: 7,
      model: "nai-diffusion-5-full",
      width: 832,
      height: 1216,
    };
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "active generation prompt" },
      history: [deletedItem],
      batchCount: 1,
    }));

    useAppStore.getState().selectImage(deletedItem);
    await vi.waitFor(() => expect(naiDesktop.loadImageFromPath).toHaveBeenCalledTimes(1));
    const running = useAppStore.getState().generate();
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await useAppStore.getState().deleteHistory(deletedItem.id);

    metadataLoad.resolve({
      ok: true,
      image: { filePath: "deleted.png", fileUrl: "local-media://deleted.png", width: 832, height: 1216 },
      metadata: {
        imported: { positivePrompt: "deleted history prompt", seed: 7 },
        characterCaptions: [],
      },
    });
    await Promise.resolve();
    expect(useAppStore.getState().params.positivePrompt).toBe("active generation prompt");
    expect(useAppStore.getState().currentImage).toBeNull();

    generation.resolve(generationResult("fresh", 22));
    await running;

    expect(generate.mock.calls[0][0].positivePrompt).toBe("active generation prompt");
    expect(useAppStore.getState().params.positivePrompt).toBe("active generation prompt");
    expect(useAppStore.getState().currentImage?.id).toBe("fresh");
    expect(useAppStore.getState().history.some((item) => item.id === deletedItem.id)).toBe(false);
  });

  it("loads a clicked history image without importing its embedded prompt", async () => {
    const loadImageFromPath = vi.fn().mockResolvedValue({
      ok: true,
      image: {
        filePath: "history.png",
        fileUrl: "local-media://history.png",
        width: 832,
        height: 1216,
      },
      metadata: {
        imported: { positivePrompt: "embedded history prompt", seed: 123 },
        characterCaptions: [],
      },
    });
    vi.stubGlobal("window", { naiDesktop: { loadImageFromPath } });
    const item = {
      id: "history-preview",
      date: "2026-08-30",
      createdAt: "2026-08-30T00:00:00.000Z",
      filePath: "history.png",
      fileUrl: "local-media://history.png",
      params: { ...useAppStore.getState().params, positivePrompt: "embedded history prompt" },
      actualSeed: 123,
      model: "nai-diffusion-5-full",
      width: 832,
      height: 1216,
    };
    useAppStore.setState((state) => ({
      activeTab: "generate",
      params: { ...state.params, positivePrompt: "keep this editor prompt", seed: 456 },
      history: [item],
    }));

    useAppStore.getState().selectImage(item);
    await vi.waitFor(() => expect(useAppStore.getState().workbenchImage?.filePath).toBe("history.png"));

    expect(useAppStore.getState().currentImage?.id).toBe(item.id);
    expect(useAppStore.getState().params.positivePrompt).toBe("keep this editor prompt");
    expect(useAppStore.getState().params.seed).toBe(456);
  });
});
