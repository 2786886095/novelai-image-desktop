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

  it("repairs stale persisted tool parameters instead of replaying invalid API fields", async () => {
    const naiDesktop = {
      ...baseNaiDesktop(),
      getSettings: vi.fn().mockResolvedValue({
        language: "zh-CN",
        persistGenerateParams: true,
        persistI2IParams: true,
        persistInpaintParams: true,
        persistUpscaleParams: true,
        persistDirectorParams: true,
        lastGenerationState: {
          params: { width: 99999, model: "retired-model" },
          batchCount: 1,
          i2iParams: { strength: Number.NaN, noise: 42, extraNoiseSeed: 9e20 },
          inpaintModel: "retired-inpaint-model",
          inpaintStrength: -2,
          inpaintNoise: 8,
          inpaintPositivePrompt: 123,
          brushSize: 999,
          brushOpacity: 0,
          upscaleScale: 9,
          directorTool: "retired-director-tool",
          augmentOptions: {
            defry: 99,
            colorizePrompt: null,
            emotion: "retired-emotion",
            emotionLevel: -4,
          },
        },
      }),
    };
    vi.stubGlobal("window", { naiDesktop });

    await useAppStore.getState().load();

    const state = useAppStore.getState();
    expect(state.params.width).toBe(1600);
    expect(state.params.model).toBe("nai-diffusion-4-5-full");
    expect(state.i2iParams).toEqual({
      strength: 0.7,
      noise: 0.99,
      extraNoiseSeed: 2_147_483_647,
    });
    expect(state.inpaintModel).toBe("nai-diffusion-4-5-full-inpainting");
    expect(state.inpaintStrength).toBe(0);
    expect(state.inpaintNoise).toBe(0.99);
    expect(state.inpaintPositivePrompt).toBe("");
    expect(state.brushSize).toBe(128);
    expect(state.brushOpacity).toBe(0.05);
    expect(state.upscaleScale).toBe(4);
    expect(state.directorTool).toBe("bg-removal");
    expect(state.augmentOptions).toEqual({
      defry: 5,
      colorizePrompt: "",
      emotion: "happy",
      emotionLevel: 0,
    });
  });
});
