import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
vi.mock("electron", () => ({ app: {}, dialog: {}, shell: {}, ipcMain: {}, protocol: {} }));
import { COMFY_IPC, type ComfyEvent } from "../../src/comfyui/contract";
import { bindComfyIpc, comfyErrorEnvelope, type ComfyIpcRegistration } from "./comfyui-ipc";
import type { ComfyLocalService } from "./comfyui-service";

function harness() {
  const frame = {}, otherFrame = {}, send = vi.fn(), handlers = new Map<string, Parameters<ComfyIpcRegistration["handle"]>[1]>();
  const removeHandler = vi.fn((channel: string) => { handlers.delete(channel); });
  let destroyed = false, subscriber: ((event: ComfyEvent) => void) | null = null;
  const contents = { mainFrame: frame, isDestroyed: () => false, send };
  const window = { isDestroyed: () => destroyed, webContents: contents } as unknown as BrowserWindow;
  let current: BrowserWindow | null = window;
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of Object.keys(COMFY_IPC).filter(key => key !== "event")) methods[name] = vi.fn(async () => name);
  const unsubscribe = vi.fn(() => { subscriber = null; });
  const service = { ...methods, onEvent: (callback: (event: ComfyEvent) => void) => { subscriber = callback; return unsubscribe; } } as unknown as ComfyLocalService;
  const dispose = bindComfyIpc({ handle: (channel, callback) => { handlers.set(channel, callback); }, removeHandler }, () => current, service);
  const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
  return { methods, handlers, send, unsubscribe, dispose, removeHandler, event, frame, otherFrame,
    setWindow: (value: BrowserWindow | null) => { current = value; }, destroy: () => { destroyed = true; },
    invoke: (name: Exclude<keyof typeof COMFY_IPC, "event">, args: unknown[] = [], incoming = event) => handlers.get(COMFY_IPC[name])!(incoming, ...args),
    emit: (value: ComfyEvent) => subscriber?.(value) };
}

describe("ComfyUI IPC trust boundary", () => {
  it("registers the exact independent interface, with no account-token, executable or arbitrary-path route", () => {
    const h = harness();
    expect([...h.handlers.keys()].sort()).toEqual(Object.values(COMFY_IPC).filter(value => value !== COMFY_IPC.event).sort());
    expect(h.handlers.size).toBe(25);
    expect([...h.handlers.keys()].every(channel => channel.startsWith("comfyui:"))).toBe(true);
    h.dispose(); expect(h.handlers.size).toBe(0); expect(h.removeHandler).toHaveBeenCalledTimes(25); expect(h.unsubscribe).toHaveBeenCalledOnce();
  });
  it("rejects a foreign sender, subframe, absent frame and destroyed or absent window before service invocation", async () => {
    const h = harness();
    for (const event of [{ ...h.event, sender: {} }, { ...h.event, senderFrame: h.otherFrame }, { ...h.event, senderFrame: null }]) {
      expect(await h.invoke("start", [], event as unknown as IpcMainInvokeEvent)).toMatchObject({ ok: false, error: { code: "invalid-request" } });
    }
    h.destroy(); expect(await h.invoke("start")).toMatchObject({ ok: false });
    h.setWindow(null); expect(await h.invoke("start")).toMatchObject({ ok: false });
    expect(h.methods.start).not.toHaveBeenCalled(); h.dispose();
  });
  it("rejects extra renderer executable/file paths on native picker routes and missing request arguments", async () => {
    const h = harness();
    for (const method of ["choosePython", "chooseInstallDirectory", "chooseOutputDirectory", "importWorkflowFile", "start"] as const) {
      expect(await h.invoke(method, ["C:/untrusted/path.exe"])).toMatchObject({ ok: false, error: { code: "invalid-request" } });
      expect(h.methods[method]).not.toHaveBeenCalled();
    }
    for (const method of ["run", "setConnection", "setLaunchOptions", "stop", "openResult", "reuseResult"] as const) {
      expect(await h.invoke(method)).toMatchObject({ ok: false, error: { code: "invalid-request" } });
      expect(h.methods[method]).not.toHaveBeenCalled();
    }
    h.dispose();
  });
  it("forwards each bounded request without manufacturing a prompt or an approval and wraps success/errors", async () => {
    const h = harness();
    expect(await h.invoke("getState")).toEqual({ ok: true, data: "getState" });
    const request = { workflowId: "id", analysisRevision: "r", slotValues: {}, seedMode: "fixed", confirmations: { thirdPartyFingerprint: null, unverifiedConversion: false } };
    expect(await h.invoke("run", [request])).toEqual({ ok: true, data: "run" }); expect(h.methods.run).toHaveBeenCalledWith(request);
    expect(await h.invoke("analyzeWorkflow", ["id", { "seed:7:seed": 17 }])).toEqual({ ok: true, data: "analyzeWorkflow" });
    expect(h.methods.analyzeWorkflow).toHaveBeenCalledWith("id", { "seed:7:seed": 17 });
    h.methods.connect.mockRejectedValueOnce(new Error("COMFY_NOT_READY: Authorization: Bearer private-fixture-token"));
    const failed = await h.invoke("connect"); expect(failed).toMatchObject({ ok: false, error: { code: "not-ready" } });
    expect(JSON.stringify(failed)).not.toContain("private-fixture-token"); h.dispose();
  });
  it("pushes only to the current trusted main window and can unsubscribe even if a window closes", () => {
    const h = harness(), event = { type: "results", results: [] } as const;
    h.emit(event as unknown as ComfyEvent); expect(h.send).toHaveBeenCalledWith(COMFY_IPC.event, event);
    h.send.mockImplementationOnce(() => { throw new Error("window closed"); }); expect(() => h.emit(event as unknown as ComfyEvent)).not.toThrow();
    h.destroy(); h.emit(event as unknown as ComfyEvent); expect(h.send).toHaveBeenCalledTimes(2);
    h.dispose(); h.emit(event as unknown as ComfyEvent); expect(h.send).toHaveBeenCalledTimes(2);
  });
  it("bounds diagnostic output and never sends an error stack or literal API secret", () => {
    const error = new Error("COMFY_OPERATION_FAILED: token=private-fixture-token " + "x".repeat(10000));
    const envelope = comfyErrorEnvelope(error); expect(envelope.ok).toBe(false);
    if (envelope.ok) throw new Error("Expected failure");
    expect(envelope.error.message.length).toBeLessThanOrEqual(2048); expect(JSON.stringify(envelope)).not.toContain("private-fixture-token");
    expect(envelope.error).not.toHaveProperty("stack");
  });
});
