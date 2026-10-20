import { app, dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { COMFY_IPC, type ComfyError, type ComfyErrorCode, type ComfyEvent, type ComfyResponse, type ComfyRunRequest,
  type ComfyLaunchOptions, type ComfyConnectionTarget, type ComfySlotValue } from "../../src/comfyui/contract";
import { buildComfyArgs } from "../../src/comfyui/launch-args";
import { ComfyLocalService } from "./comfyui-service";
import { parseComfyWorkflow, analyzeComfyWorkflow } from "./comfyui-analysis";
import { builtinComfyWorkflows } from "./comfyui-presets";
import { redactComfyLog } from "./comfyui-process";

type Method = Exclude<keyof typeof COMFY_IPC, "event">;
type Invoke = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<ComfyResponse<unknown>>;
export interface ComfyIpcRegistration {
  handle(channel: string, callback: Invoke): void;
  removeHandler(channel: string): void;
}
export function comfyErrorEnvelope(error: unknown): ComfyResponse<never> {
  const raw = error instanceof Error ? error.message : String(error);
  const message = redactComfyLog(raw).slice(0, 2048);
  const technicalCode = /\b(COMFY_[A-Z0-9_]+)\b/.exec(message)?.[1] || "COMFY_OPERATION_FAILED";
  const code: ComfyErrorCode = /STALE/.test(technicalCode) ? "stale"
    : /NOT_CONFIGURED/.test(technicalCode) ? "not-configured"
    : /NOT_READY/.test(technicalCode) ? "not-ready"
    : /NOT_FOUND/.test(technicalCode) ? "not-found"
    : /BUSY/.test(technicalCode) ? "busy"
    : /ABORTED|CANCELLED/.test(technicalCode) ? "cancelled"
    : /CONFIRM|BLOCKED|CLOUD|NOT_VERIFIED/.test(technicalCode) ? "blocked"
    : /SENDER|ARGUMENT|INVALID|REQUEST|ONLY|PATH/.test(technicalCode) ? "invalid-request"
    : /ENOENT|EACCES|EPERM|ENOSPC/.test(message) ? "io" : "internal";
  const result: ComfyError = { code, message };
  const issues = error && typeof error === "object" && "issues" in error ? error.issues : null;
  if (Array.isArray(issues)) {
    result.issues = issues.slice(0, 100).filter(item => item && typeof item === "object")
      .map(item => ({ ...item, message: redactComfyLog(String(item.message || "")).slice(0, 2048),
        ...(item.detail ? { detail: redactComfyLog(String(item.detail)).slice(0, 2048) } : {}) }));
  }
  return { ok: false, error: result };
}

/** Separate from account-bound IPC: this tool never needs a NovelAI token. */
export function bindComfyIpc(
  registration: ComfyIpcRegistration,
  getWindow: () => BrowserWindow | null,
  service: ComfyLocalService,
): () => void {
  const routes: Record<Method, { min: number; max: number; call: (...args: unknown[]) => unknown }> = {
    getState: { min: 0, max: 0, call: () => service.getState() },
    snapshot: { min: 0, max: 0, call: () => service.snapshot() },
    chooseInstallDirectory: { min: 0, max: 0, call: () => service.chooseInstallDirectory() },
    choosePython: { min: 0, max: 0, call: () => service.choosePython() },
    chooseOutputDirectory: { min: 0, max: 0, call: () => service.chooseOutputDirectory() },
    detectInstall: { min: 0, max: 0, call: () => service.detectInstall() },
    setLaunchOptions: { min: 1, max: 1, call: patch => service.setLaunchOptions(patch as Partial<ComfyLaunchOptions>) },
    setConnection: { min: 1, max: 1, call: target => service.setConnection(target as ComfyConnectionTarget) },
    start: { min: 0, max: 0, call: () => service.start() },
    connect: { min: 0, max: 0, call: () => service.connect() },
    stop: { min: 1, max: 1, call: options => service.stop(options as { interruptRunning: boolean }) },
    disconnect: { min: 0, max: 0, call: () => service.disconnect() },
    refreshInventory: { min: 0, max: 0, call: () => service.refreshInventory() },
    importWorkflowFile: { min: 0, max: 0, call: () => service.importWorkflowFile() },
    importWorkflowJson: { min: 1, max: 2, call: (text, name) => service.importWorkflowJson(text as string, name as string | undefined) },
    listWorkflows: { min: 0, max: 0, call: () => service.listWorkflows() },
    renameWorkflow: { min: 2, max: 2, call: (id, name) => service.renameWorkflow(id as string, name as string) },
    deleteWorkflow: { min: 1, max: 1, call: id => service.deleteWorkflow(id as string) },
    analyzeWorkflow: { min: 1, max: 2, call: (id, values) => service.analyzeWorkflow(id as string, values as Record<string, ComfySlotValue> | undefined) },
    run: { min: 1, max: 1, call: request => service.run(request as ComfyRunRequest) },
    cancel: { min: 1, max: 1, call: id => service.cancel(id as string) },
    listResults: { min: 0, max: 0, call: () => service.listResults() },
    openResult: { min: 1, max: 1, call: id => service.openResult(id as string) },
    openResultsFolder: { min: 0, max: 0, call: () => service.openResultsFolder() },
    reuseResult: { min: 1, max: 1, call: id => service.reuseResult(id as string) },
  };
  const channels: string[] = [];
  for (const [method, route] of Object.entries(routes) as Array<[Method, typeof routes[Method]]>) {
    const channel = COMFY_IPC[method];
    registration.handle(channel, async (event, ...args) => {
      try {
        const win = getWindow();
        if (!win || win.isDestroyed() || win.webContents.isDestroyed() || event.sender !== win.webContents
          || !event.senderFrame || event.senderFrame !== win.webContents.mainFrame) throw new Error("COMFY_SENDER_DENIED");
        if (args.length < route.min || args.length > route.max) throw new Error("COMFY_IPC_ARGUMENT_COUNT");
        return { ok: true, data: await route.call(...args) };
      } catch (error) { return comfyErrorEnvelope(error); }
    });
    channels.push(channel);
  }
  const unsubscribe = service.onEvent((event: ComfyEvent) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    try { win.webContents.send(COMFY_IPC.event, event); } catch { /* window is closing */ }
  });
  return () => { unsubscribe(); for (const channel of channels) registration.removeHandler(channel); };
}

let service: ComfyLocalService | null = null;
let dispose: (() => void) | null = null;
export function registerComfyIpc(getWindow: () => BrowserWindow | null, outputDirectory?: () => string): void {
  if (service) return;
  async function pick(properties: Array<"openDirectory" | "openFile" | "createDirectory">, filters?: Electron.FileFilter[]): Promise<string | null> {
    const options: Electron.OpenDialogOptions = { properties, ...(filters ? { filters } : {}) };
    const win = getWindow();
    const selected = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return selected.canceled ? null : selected.filePaths[0] || null;
  }
  service = new ComfyLocalService({
    userData: app.getPath("userData"),
    defaultOutputDirectory: outputDirectory || (() => path.join(app.getPath("pictures"), "LangbaiNovelAIStudio")),
    chooseDirectory: () => pick(["openDirectory", "createDirectory"]),
    choosePython: () => pick(["openFile"], process.platform === "win32" ? [{ name: "Python", extensions: ["exe"] }] : undefined),
    chooseWorkflowFile: () => pick(["openFile"], [{ name: "ComfyUI workflows", extensions: ["json", "png", "webp"] }]),
    revealResult: file => shell.showItemInFolder(file),
    openDirectory: async directory => { const error = await shell.openPath(directory); if (error) throw new Error("COMFY_OPEN_DIRECTORY_FAILED: " + error); },
    parseWorkflow: parseComfyWorkflow,
    analyze: analyzeComfyWorkflow,
    buildArgs: config => buildComfyArgs(config.install, config.launch),
    presets: builtinComfyWorkflows,
    onDiagnostic: error => console.warn("[ComfyUI]", comfyErrorEnvelope(error)),
  });
  dispose = bindComfyIpc(ipcMain, getWindow, service);
}
export function comfyHasActiveJobs(): boolean { return service?.hasActiveJobs() || false; }
export function comfyNeedsQuitCleanup(): boolean { return service?.needsQuitCleanup() || false; }
export async function cancelComfyJobs(): Promise<void> { await service?.cancelActive(); }
export async function shutdownOwnedComfy(_reason: "quit" | "update" = "quit"): Promise<void> { await service?.shutdown(); }
export function resetComfyAfterUpdateFailure(): void { service?.resumeAfterUpdateFailure(); }
export function shutdownOwnedComfySync(): void { service?.shutdownSync(); dispose?.(); dispose = null; }
