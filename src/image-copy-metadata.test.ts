import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { copyImageForClipboard, installImageCopy } from "./image-copy";
import { useAppStore } from "./store";
import type { AppSettings } from "./types";
beforeEach(() => { useAppStore.setState(useAppStore.getInitialState(), true); });
afterEach(() => vi.unstubAllGlobals());
it.each([false, undefined])("keeps native IPC unused with OFF/omitted setting %s", async enabled => {
  const native = vi.fn().mockResolvedValue({ status: "copied" }); const browser = vi.fn().mockResolvedValue(undefined);
  expect(await copyImageForClipboard("fixture.png", enabled === true, native, browser)).toBeUndefined();
  expect(native).not.toHaveBeenCalled(); expect(browser).toHaveBeenCalledExactlyOnceWith("fixture.png");
});
it("bypasses browser sanitization only for verified native success with ON", async () => {
  const native = vi.fn().mockResolvedValue({ status: "copied" }); const browser = vi.fn();
  expect(await copyImageForClipboard("nai-local://fixture", true, native, browser)).toEqual({ status: "copied" });
  expect(native).toHaveBeenCalledExactlyOnceWith("nai-local://fixture"); expect(browser).not.toHaveBeenCalled();
});
it.each(["unsupported", "failed"])("retains native/browser fallback and a %s indication", async status => {
  const browser = vi.fn().mockResolvedValue(undefined);
  expect(await copyImageForClipboard("fixture.png", true, vi.fn().mockResolvedValue({ status }), browser)).toEqual({ status });
  expect(browser).toHaveBeenCalledExactlyOnceWith("fixture.png");
});
it("indicates unsupported when older preload has no API", async () => {
  const browser = vi.fn().mockResolvedValue(undefined);
  expect(await copyImageForClipboard("fixture.png", true, undefined, browser)).toEqual({ status: "unsupported" });
  expect(browser).toHaveBeenCalledOnce();
});
it("sanitizes IPC errors/malformed results and falls back", async () => {
  const browser = vi.fn().mockResolvedValue(undefined);
  for (const native of [vi.fn().mockRejectedValue(new Error("private fixture")), vi.fn().mockResolvedValue(null), vi.fn().mockResolvedValue({ status: "unknown" })]) {
    expect(await copyImageForClipboard("fixture.png", true, native, browser)).toEqual({ status: "failed" });
  }
  expect(browser).toHaveBeenCalledTimes(3);
});
it("does not claim ordinary copy succeeded when fallback also fails", async () => {
  await expect(copyImageForClipboard("fixture.png", true, undefined, vi.fn().mockRejectedValue(new Error("IMAGE_COPY_FAILED")))).rejects.toThrow("IMAGE_COPY_FAILED");
});

class ImageFixture {
  isConnected = true;
  dataset = { imageCopySrc: "nai-local://fixture" };
  closest(selector: string) { return selector.includes("input,") || selector.includes("[hidden]") ? null : this; }
  getClientRects() { return [1]; }
}
function shortcut(nativeCopy?: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("Element", ImageFixture); vi.stubGlobal("HTMLImageElement", ImageFixture);
  vi.stubGlobal("window", { naiDesktop: nativeCopy ? { copyImageWithMetadata: nativeCopy } : {} });
  const listeners = new Map<string, Function>();
  const doc = { activeElement: null, getSelection: () => null, querySelectorAll: () => [],
    addEventListener: (name: string, fn: Function) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) };
  const write = vi.fn().mockResolvedValue(undefined);
  const dispose = installImageCopy(doc as any, write);
  listeners.get("pointerdown")!({ isTrusted: true, target: new ImageFixture() });
  const copy = () => listeners.get("keydown")!({ isTrusted: true, key: "c", ctrlKey: true, metaKey: false,
    altKey: false, shiftKey: false, repeat: false, defaultPrevented: false, target: null, preventDefault() {}, stopPropagation() {} });
  return { dispose, copy, write };
}
it.each([
  ["copied", "Original PNG copied (metadata preserved)"],
  ["unsupported", "Image copied; metadata preservation unsupported for this source"],
  ["failed", "Image copied; metadata preservation failed"],
])("shows truthful shortcut status for %s", async (status, toast) => {
  useAppStore.setState({ settings: { language: "en-US", copyImageMetadata: true } as AppSettings });
  const native = vi.fn().mockResolvedValue({ status }); const ui = shortcut(native);
  try {
    ui.copy(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(useAppStore.getState().toast).toBe(toast);
    expect(ui.write).toHaveBeenCalledTimes(status === "copied" ? 0 : 1);
  } finally { ui.dispose(); }
});
it("uses the current global setting for each shortcut, not selection-time state", async () => {
  useAppStore.setState({ settings: { language: "en-US", copyImageMetadata: false } as AppSettings });
  const native = vi.fn().mockResolvedValue({ status: "copied" }); const ui = shortcut(native);
  try {
    ui.copy(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(native).not.toHaveBeenCalled(); expect(useAppStore.getState().toast).toBe("Image copied");
    useAppStore.setState({ settings: { language: "en-US", copyImageMetadata: true } as AppSettings });
    ui.copy(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(native).toHaveBeenCalledOnce(); expect(ui.write).toHaveBeenCalledOnce();
  } finally { ui.dispose(); }
});
it("shows an unsupported notice when ON but the native preload API is absent", async () => {
  useAppStore.setState({ settings: { language: "en-US", copyImageMetadata: true } as AppSettings });
  const ui = shortcut();
  try { ui.copy(); await new Promise(resolve => setTimeout(resolve, 0)); expect(useAppStore.getState().toast).toContain("unsupported"); }
  finally { ui.dispose(); }
});
