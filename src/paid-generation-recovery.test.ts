import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./store";

const gatewayError = () => new Error(
  "Error invoking remote method: <!doctype html><html><body><h1>Bad Gateway</h1><p>Error code 502</p></body></html>",
);

describe("paid image actions recover from rejected IPC", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true);
  });

  it.each([
    ["图生图", "generateI2I", "generateI2I"],
    ["局部重绘", "inpaint", "inpaint"],
    ["超分", "upscaleCurrentImage", "upscaleImage"],
    ["后期", "runDirectorTool", "augmentImage"],
  ] as const)("%s 请求拒绝后解除生成锁", async (_label, actionName, ipcName) => {
    const rejectedRequest = vi.fn().mockRejectedValue(gatewayError());
    const naiDesktop = {
      hasToken: vi.fn().mockResolvedValue({ hasToken: true, anlasBalance: 100, tierName: "Opus" }),
      quoteAnlas: vi.fn().mockResolvedValue({ ok: true, amount: 1, balance: 100 }),
      loadImageFromPath: vi.fn().mockResolvedValue({
        ok: true,
        image: "source-image-base64",
        width: 832,
        height: 1216,
      }),
      [ipcName]: rejectedRequest,
    };
    vi.stubGlobal("window", { naiDesktop });
    useAppStore.setState((state) => ({
      account: { hasToken: true, anlasBalance: 100, tierName: "Opus" },
      params: { ...state.params, positivePrompt: "1girl" },
      workbenchImage: {
        filePath: "source.png",
        fileUrl: "local-media://source.png",
        width: 832,
        height: 1216,
      },
      inpaintMask: "mask-base64",
    }));

    await (useAppStore.getState()[actionName] as () => Promise<void>)();

    const state = useAppStore.getState();
    expect(rejectedRequest).toHaveBeenCalledTimes(1);
    expect(state.isGenerating).toBe(false);
    expect(state.currentAnlasSpent).toBeNull();
    expect(state.toast).toContain("HTTP 502 Bad Gateway");
    expect(state.toast).not.toContain("<html");
    expect(state.lastError).not.toContain("<html");
  });
});
