import { assertUpdateOutputProtection } from "./update-output-protection";
import { installedAppDir } from "./app-mode";
import { readStore } from "./store";
import { app } from "electron";
import type { BrowserWindow } from "electron";
import axios from "axios";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rm } from "fs/promises";
import { basename, join } from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import type { UpdateProgressEvent } from "../../src/types";
import { proxyConfig } from "./proxy";
import {
  latestGithubRelease,
  type RemoteReleaseAsset,
} from "./update";


let getMainWindow: (() => BrowserWindow | null) | undefined;
let downloadedInstallerPath = "";
let downloadedVersion = "";
let downloadInFlight: Promise<{ ok: boolean; message: string }> | null = null;
let installLaunchInFlight = false;
let automaticInstallTimer: NodeJS.Timeout | null = null;

function send(payload: UpdateProgressEvent) {
  const mainWindow = getMainWindow?.();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send("app:updateEvent", payload);
}

/** Retains the existing startup wiring contract used by electron/main.ts. */
export function wireAutoUpdater(getWindow: () => BrowserWindow | null) {
  getMainWindow = getWindow;
}

function safeAssetName(value: string): string {
  const name = basename(String(value ?? "").trim());
  if (!name || name !== value || /[\\/]/.test(name)) throw new Error("更新文件名不安全");
  return name;
}

function findAsset(assets: RemoteReleaseAsset[], name: string): RemoteReleaseAsset {
  const found = assets.find((asset) => asset.name === name);
  if (!found) throw new Error(`远程发行版缺少 ${name}`);
  return found;
}

function validateDownloadUrl(url: string, _source: "github") {
  const parsed = new URL(url);
  const allowed = new Set(["github.com", "api.github.com", "objects.githubusercontent.com"]);
  if (parsed.protocol !== "https:" || !allowed.has(parsed.hostname.toLowerCase())) {
    throw new Error(`拒绝不受信任的更新地址：${parsed.hostname}`);
  }
}

async function sha512Base64(path: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("base64");
}

async function downloadAsset(
  asset: RemoteReleaseAsset,
  destination: string,
  _source: "github",
  expectedSize: number,
  progressState: { completed: number; total: number },
) {
  validateDownloadUrl(asset.url, _source);
  const response = await axios.get(asset.url, {
    responseType: "stream",
    timeout: 60_000,
    maxRedirects: 8,
    headers: { Accept: "application/octet-stream" },
    ...proxyConfig("update"),
  });
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const percent = progressState.total > 0
        ? Math.min(99, Math.round(((progressState.completed + received) / progressState.total) * 100))
        : 0;
      send({ kind: "progress", percent });
      callback(null, chunk);
    },
  });
  try {
    await pipeline(response.data, meter, createWriteStream(destination));
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  if (expectedSize > 0 && received !== expectedSize) {
    await rm(destination, { force: true });
    throw new Error(`${asset.name} 大小校验失败`);
  }
  progressState.completed += received;
}

async function readTextAsset(asset: RemoteReleaseAsset, _source: "github"): Promise<string> {
  validateDownloadUrl(asset.url, _source);
  const response = await axios.get(asset.url, {
    responseType: "text",
    timeout: 20_000,
    maxRedirects: 8,
    headers: { Accept: "application/json, text/yaml, text/plain, */*" },
    ...proxyConfig("update"),
  });
  return String(response.data ?? "");
}

function parseLatestYamlSha512(payload: string): string {
  const match = payload.match(/^\s*sha512\s*:\s*["']?([^\s"']+)["']?\s*$/im);
  return match?.[1] ?? "";
}

async function downloadFromGithub(): Promise<{ path: string; version: string }> {
  const release = await latestGithubRelease();
  const setup = release.assets.find((asset) => /^Langbai-NovelAI-Studio-Setup-[\w.+-]+\.exe$/i.test(asset.name));
  if (!setup) throw new Error("GitHub 发行版缺少 Windows 安装包");
  const yaml = findAsset(release.assets, "latest.yml");
  const expectedHash = parseLatestYamlSha512(await readTextAsset(yaml, "github"));
  if (!expectedHash) throw new Error("GitHub 更新清单缺少完整性校验值");

  const updateDir = join(app.getPath("temp"), "langbai-novelai-update", release.version);
  await mkdir(updateDir, { recursive: true });
  const installerPath = join(updateDir, safeAssetName(setup.name));
  const expectedSize = setup.size ?? 0;
  await downloadAsset(
    setup,
    installerPath,
    "github",
    expectedSize,
    { completed: 0, total: expectedSize },
  );
  if (await sha512Base64(installerPath) !== expectedHash) {
    await rm(installerPath, { force: true });
    throw new Error("GitHub 安装包完整性校验失败");
  }
  return { path: installerPath, version: release.version };
}

async function runDownload(_preferredSource: string): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") {
    return { ok: false, message: "当前平台请从发行页面手动下载安装包。" };
  }
  try { assertUpdateOutputProtection(installedAppDir(), readStore(), {installerMigratesWorkspace:true}); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); send({ kind: "error", message }); return { ok: false, message }; }
  downloadedInstallerPath = "";
  downloadedVersion = "";
  send({ kind: "checking" });

  const errors: string[] = [];
  {
    try {
      const result = await downloadFromGithub();
      downloadedInstallerPath = result.path;
      downloadedVersion = result.version;
      send({ kind: "progress", percent: 100 });
      send({ kind: "downloaded", version: result.version });
      scheduleAutomaticInstall();
      return { ok: true, message: "安装包下载完成，正在自动重启安装" };
    } catch (error: any) {
      errors.push(error?.message ?? String(error));
    }
  }

  const message = `更新下载失败：${errors.join("；")}`;
  send({ kind: "error", message });
  return { ok: false, message };
}

/** Download only from GitHub; accept obsolete saved source values. */
export function downloadUpdate(preferredSource: string = "github"): Promise<{ ok: boolean; message: string }> {
  if (!downloadInFlight) {
    downloadInFlight = runDownload(preferredSource).finally(() => {
      downloadInFlight = null;
    });
  }
  return downloadInFlight;
}

/**
 * Mirrors electron-updater's supported NSIS update arguments. `--updated`
 * makes the installer reuse the registered installation mode/path, `/S`
 * skips the assisted pages after the first install, and `--force-run`
 * starts the newly installed build when the silent update completes.
 */
export function automaticInstallerArgs(): string[] {
  return ["--updated", "/S", "--force-run"];
}

function scheduleAutomaticInstall() {
  if (automaticInstallTimer) clearTimeout(automaticInstallTimer);
  automaticInstallTimer = setTimeout(() => {
    automaticInstallTimer = null;
    installUpdate();
  }, 850);
}

/** Launches the verified Setup.exe silently, then exits the current build. */
export function installUpdate() {
  if (process.platform !== "win32" || !downloadedInstallerPath || installLaunchInFlight) return;
  try { assertUpdateOutputProtection(installedAppDir(), readStore(), {installerMigratesWorkspace:true}); }
  catch (error) { send({ kind: "error", message: error instanceof Error ? error.message : String(error) }); return; }
  installLaunchInFlight = true;
  const child = spawn(downloadedInstallerPath, automaticInstallerArgs(), {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.once("error", (error) => {
    installLaunchInFlight = false;
    send({ kind: "error", message: `自动安装启动失败：${error.message}` });
  });
  child.once("spawn", () => {
    console.info(`[update] launching verified silent installer for ${downloadedVersion}`);
    setTimeout(() => app.quit(), 450);
  });
  child.unref();
}
