import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";

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

  it("does not enqueue a job whose quote resolves after 清空排队", async () => {
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
});
