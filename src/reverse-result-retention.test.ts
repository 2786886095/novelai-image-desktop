import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";
import type { PromptVariants } from "./types";

type Reply = { ok: boolean; prompt?: string; variants?: PromptVariants; message?: string };
const previous = { namePrompt: "old named prompt", featurePrompt: "old feature prompt" };

function deferred() {
  let resolve!: (reply: Reply) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Reply>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function bridge(reversePrompt: unknown) {
  const api = { reversePrompt, addReverseHistoryItem: vi.fn().mockResolvedValue({ ok: true }) };
  vi.stubGlobal("window", { naiDesktop: api });
  return api;
}

describe("reverse requests preserve the last usable result", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppStore.setState(useAppStore.getInitialState(), true);
    useAppStore.setState({
      inspectImageBase64: "synthetic-no-network",
      reverseKnownCharacter: true,
      reversePromptText: "old prompt",
      reversePromptVariants: previous,
    });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(["refusal", "invalid JSON", "filtered", "truncated"])("preserves text and variants during and after %s", async (message) => {
    const pending = deferred();
    const api = bridge(vi.fn(() => pending.promise));
    const running = useAppStore.getState().runReversePrompt();
    expect(useAppStore.getState().reversePromptText).toBe("old prompt");
    expect(useAppStore.getState().reversePromptVariants).toEqual(previous);
    pending.resolve({ ok: false, message });
    await running;
    expect(useAppStore.getState().reversePromptText).toBe("old prompt");
    expect(useAppStore.getState().reversePromptVariants).toEqual(previous);
    expect(useAppStore.getState().reverseJobs[0]).toMatchObject({ status: "failed", message });
    expect(useAppStore.getState().reverseHistory).toHaveLength(0);
    expect(api.addReverseHistoryItem).not.toHaveBeenCalled();
  });

  it("preserves the result on a rejected IPC call", async () => {
    const api = bridge(vi.fn().mockRejectedValue(new Error("synthetic offline")));
    await useAppStore.getState().runReversePrompt();
    expect(useAppStore.getState().reversePromptText).toBe("old prompt");
    expect(useAppStore.getState().reversePromptVariants).toEqual(previous);
    expect(useAppStore.getState().reverseJobs[0].status).toBe("failed");
    expect(api.addReverseHistoryItem).not.toHaveBeenCalled();
  });

  it("updates both variants and history only on success", async () => {
    const next = { namePrompt: "new named prompt", featurePrompt: "new feature prompt" };
    const api = bridge(vi.fn().mockResolvedValue({ ok: true, prompt: next.namePrompt, variants: next }));
    await useAppStore.getState().runReversePrompt();
    expect(useAppStore.getState().reversePromptText).toBe(next.namePrompt);
    expect(useAppStore.getState().reversePromptVariants).toEqual(next);
    expect(useAppStore.getState().reverseJobs[0].status).toBe("done");
    expect(api.addReverseHistoryItem).toHaveBeenCalledTimes(1);
  });

  it("does not erase the old variants when a pending job is cancelled", async () => {
    const pending = deferred();
    const api = bridge(vi.fn(() => pending.promise));
    const running = useAppStore.getState().runReversePrompt();
    useAppStore.getState().removeReverseJob(useAppStore.getState().reverseJobs[0].id);
    pending.resolve({ ok: true, prompt: "cancelled result" });
    await running;
    expect(useAppStore.getState().reversePromptText).toBe("old prompt");
    expect(useAppStore.getState().reversePromptVariants).toEqual(previous);
    expect(api.addReverseHistoryItem).not.toHaveBeenCalled();
  });

  it("does not restore stale variants when an older request fails after a newer success", async () => {
    const first = deferred(), second = deferred();
    const api = bridge(vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise));
    const a = useAppStore.getState().runReversePrompt();
    const b = useAppStore.getState().runReversePrompt();
    const next = { namePrompt: "latest name", featurePrompt: "latest features" };
    second.resolve({ ok: true, prompt: "latest result", variants: next });
    await b;
    first.resolve({ ok: false, message: "older refusal" });
    await a;
    expect(useAppStore.getState().reversePromptText).toBe("latest result");
    expect(useAppStore.getState().reversePromptVariants).toEqual(next);
    expect(api.addReverseHistoryItem).toHaveBeenCalledTimes(1);
  });
});
