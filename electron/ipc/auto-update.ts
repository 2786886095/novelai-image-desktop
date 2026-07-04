import type { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateProgressEvent } from "../../src/types";
import { isPortableBuild } from "./app-mode";

// Manual, user-triggered download only — never silently fetch/replace the app
// in the background. The renderer decides when to call downloadUpdate().
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let wired = false;

function send(getWindow: () => BrowserWindow | null, payload: UpdateProgressEvent) {
  getWindow()?.webContents.send("app:updateEvent", payload);
}

/** Wires electron-updater's events to the renderer. Call once at startup. */
export function wireAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (wired) return;
  wired = true;
  autoUpdater.on("checking-for-update", () => send(getWindow, { kind: "checking" }));
  autoUpdater.on("update-available", (info) => send(getWindow, { kind: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send(getWindow, { kind: "not-available" }));
  autoUpdater.on("download-progress", (progress) =>
    send(getWindow, { kind: "progress", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) => send(getWindow, { kind: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => send(getWindow, { kind: "error", message: error?.message ?? "更新失败" }));
}

/**
 * Checks for and downloads the latest release. Only meaningful for a real
 * (NSIS) install: the portable exe has no installed copy for electron-updater
 * to replace, so callers should show the manual releaseUrl link instead.
 */
export async function downloadUpdate(): Promise<{ ok: boolean; message: string }> {
  if (isPortableBuild()) {
    return { ok: false, message: "便携版不支持应用内更新，请手动下载最新版本替换当前文件。" };
  }
  try {
    await autoUpdater.checkForUpdates();
    await autoUpdater.downloadUpdate();
    return { ok: true, message: "开始下载更新" };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? "检查更新失败" };
  }
}

/** Quits and relaunches the app with the downloaded update applied. */
export function installUpdate() {
  if (isPortableBuild()) return;
  autoUpdater.quitAndInstall();
}
