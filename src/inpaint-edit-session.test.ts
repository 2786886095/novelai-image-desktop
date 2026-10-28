import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeInpaintEditMask, inpaintEditText, validateInpaintEditSource } from "./inpaint-edit-session";

describe("saved inpaint editor image/mask preflight", () => {
  let width: number, height: number, fail: boolean, wait: boolean;
  let draw: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    width = 2; height = 2; fail = false; wait = false; draw = vi.fn();
    vi.stubGlobal("Image", class {
      naturalWidth = width; naturalHeight = height;
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => { if (!wait) { if (fail) this.onerror?.(); else this.onload?.(); } }); }
    });
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: draw, getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255]) }) }) }) });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("keeps an empty/rectangle-only mask distinct from a corrupt mask", async () => {
    expect(await decodeInpaintEditMask(null, 2, 2)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });
  it("decodes full source-resolution alpha without rescaling", async () => {
    const result = await decodeInpaintEditMask("saved-png", 2, 2);
    expect(draw).toHaveBeenCalledWith(expect.anything(), 0, 0);
    expect(Array.from(result ?? [])).toEqual([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255]);
  });
  it("rejects corrupt image data before accessing the edit canvas", async () => {
    fail = true;
    await expect(decodeInpaintEditMask("corrupt-png", 2, 2)).rejects.toThrow("无法解码");
    expect(draw).not.toHaveBeenCalled();
  });
  it("rejects a mask from different dimensions, instead of stretching it", async () => {
    await expect(decodeInpaintEditMask("different-png", 3, 2)).rejects.toThrow("蒙版尺寸与原图不一致");
    expect(draw).not.toHaveBeenCalled();
  });
  it("validates the original image itself", async () => {
    await expect(validateInpaintEditSource({ filePath: "original.png", fileUrl: "fixture://original", width: 2, height: 2 })).resolves.toBeUndefined();
    await expect(validateInpaintEditSource({ filePath: "original.png", fileUrl: "fixture://changed", width: 3, height: 2 })).rejects.toThrow("原图尺寸在重绘后已改变");
  });
  it.each([0, -1, 1.5, Number.NaN])("rejects invalid source dimensions %s", async (bad) => {
    await expect(decodeInpaintEditMask(null, bad, 2)).rejects.toThrow("保存的编辑尺寸无效");
  });
  it("bounds an image decode that never completes", async () => {
    vi.useFakeTimers(); wait = true;
    const assertion = expect(decodeInpaintEditMask("stalled", 2, 2)).rejects.toThrow("图片解码超时");
    await vi.advanceTimersByTimeAsync(15000); await assertion;
  });
  it("gives the restore control an explicit label", () => {
    expect(inpaintEditText("zh-CN").hint).toBeTruthy();
    expect(inpaintEditText("zh-CN").returnEdit).toBe("返回编辑");
    expect(inpaintEditText(undefined).returnEdit).toBe("返回编辑");
  });
});
