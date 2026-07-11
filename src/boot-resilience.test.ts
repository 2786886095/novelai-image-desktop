import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";

function baseNaiDesktop() {
  return {
    onUpdateEvent: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({
      language: "zh-CN",
      persistGenerateParams: true,
      persistI2IParams: true,
      persistInpaintParams: true,
      persistUpscaleParams: true,
      persistDirectorParams: true,
    }),
    accountCached: vi.fn().mockResolvedValue({ hasToken: false }),
    isFirstRun: vi.fn().mockResolvedValue(false),
    getHistoryDates: vi.fn().mockResolvedValue([]),
    getHistoryGroups: vi.fn().mockResolvedValue([]),
    isPortable: vi.fn().mockResolvedValue(false),
    getHistory: vi.fn().mockResolvedValue([]),
  };
}

describe("boot resilience (P1-07)", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it("a rejected non-critical read (history dates) still completes boot with a safe default", async () => {
    const naiDesktop = {
      ...baseNaiDesktop(),
      getHistoryDates: vi.fn().mockRejectedValue(new Error("drive offline")),
      getHistoryGroups: vi.fn().mockRejectedValue(new Error("drive offline")),
      getHistory: vi.fn().mockRejectedValue(new Error("drive offline")),
    };
    vi.stubGlobal("window", { naiDesktop });

    await useAppStore.getState().load();

    const state = useAppStore.getState();
    expect(state.bootDone).toBe(true);
    expect(state.bootError).toBeNull();
    expect(state.historyDates).toEqual([]);
    expect(state.historyGroups).toEqual([]);
    expect(state.history).toEqual([]);
  });

  it("a rejected critical read (settings) surfaces a retriable bootError instead of hanging forever", async () => {
    const naiDesktop = {
      ...baseNaiDesktop(),
      getSettings: vi.fn().mockRejectedValue(new Error("IPC channel closed")),
    };
    vi.stubGlobal("window", { naiDesktop });

    await useAppStore.getState().load();

    const state = useAppStore.getState();
    expect(state.bootDone).toBe(false);
    expect(state.bootError).toBe("IPC channel closed");
  });

  it("retrying load() after a settings failure recovers once the read succeeds", async () => {
    const getSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error("IPC channel closed"))
      .mockResolvedValueOnce({
        language: "zh-CN",
        persistGenerateParams: true,
        persistI2IParams: true,
        persistInpaintParams: true,
        persistUpscaleParams: true,
        persistDirectorParams: true,
      });
    const naiDesktop = { ...baseNaiDesktop(), getSettings };
    vi.stubGlobal("window", { naiDesktop });

    await useAppStore.getState().load();
    expect(useAppStore.getState().bootError).toBe("IPC channel closed");

    await useAppStore.getState().load();
    expect(useAppStore.getState().bootDone).toBe(true);
    expect(useAppStore.getState().bootError).toBeNull();
  });
});
