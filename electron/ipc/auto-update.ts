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
  latestGiteeRelease,
  latestGithubRelease,
  type RemoteReleaseAsset,
  type UpdateSource,
  updateSourceOrder,
} from "./update";

interface GiteeUpdateManifest {
  schemaVersion: 1;
  version: string;
  filename: string;
  size: number;
  sha512: string;
  parts: Array<{ name: string; size: number; sha512: string }>;
}

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

function validateDownloadUrl(url: string, source: "gitee" | "github") {
  const parsed = new URL(url);
  const allowed = source === "gitee"
    ? new Set(["gitee.com", "files.gitee.com", "foruda.gitee.com"])
    : new Set(["github.com", "api.github.com", "objects.githubusercontent.com"]);
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
  source: "gitee" | "github",
  expectedSize: number,
  progressState: { completed: number; total: number },
) {
  validateDownloadUrl(asset.url, source);
  const response = await axios.get(asset.url, {
    responseType: "stream",
    timeout: 60_000,
    maxRedirects: 8,
    headers: { Accept: "application/octet-stream" },
    ...(source === "github" ? proxyConfig("update") : {}),
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

function parseGiteeManifest(payload: unknown): GiteeUpdateManifest {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload as any;
  const parts = Array.isArray(data?.parts) ? data.parts : [];
  const manifest: GiteeUpdateManifest = {
    schemaVersion: Number(data?.schemaVersion) as 1,
    version: String(data?.version ?? "").replace(/^v/, ""),
    filename: safeAssetName(String(data?.filename ?? "")),
    size: Number(data?.size),
    sha512: String(data?.sha512 ?? ""),
    parts: parts.map((part: any) => ({
      name: safeAssetName(String(part?.name ?? "")),
      size: Number(part?.size),
      sha512: String(part?.sha512 ?? ""),
    })),
  };
  if (
    manifest.schemaVersion !== 1
    || !manifest.version
    || !/^Langbai-NovelAI-Studio-Setup-[\w.+-]+\.exe$/i.test(manifest.filename)
    || !Number.isSafeInteger(manifest.size)
    || manifest.size <= 0
    || !/^[A-Za-z0-9+/]{80,}={0,2}$/.test(manifest.sha512)
    || manifest.parts.length === 0
    || manifest.parts.some((part) => !Number.isSafeInteger(part.size) || part.size <= 0)
    || manifest.parts.reduce((sum, part) => sum + part.size, 0) !== manifest.size
  ) {
    throw new Error("Gitee 更新清单格式无效");
  }
  return manifest;
}

async function readTextAsset(asset: RemoteReleaseAsset, source: "gitee" | "github"): Promise<string> {
  validateDownloadUrl(asset.url, source);
  const response = await axios.get(asset.url, {
    responseType: "text",
    timeout: 20_000,
    maxRedirects: 8,
    headers: { Accept: "application/json, text/yaml, text/plain, */*" },
    ...(source === "github" ? proxyConfig("update") : {}),
  });
  return String(response.data ?? "");
}

async function downloadFromGitee(): Promise<{ path: string; version: string }> {
  const release = await latestGiteeRelease({ includeAttachments: true });
  const manifestAsset = findAsset(release.assets, "gitee-update.json");
  const manifest = parseGiteeManifest(await readTextAsset(manifestAsset, "gitee"));
  if (manifest.version !== release.version) throw new Error("Gitee 更新清单版本与发行版不一致");

  const updateDir = join(app.getPath("temp"), "langbai-novelai-update", manifest.version);
  await mkdir(updateDir, { recursive: true });
  const progressState = { completed: 0, total: manifest.size };
  const partPaths: string[] = [];
  for (const part of manifest.parts) {
    const asset = findAsset(release.assets, part.name);
    const partPath = join(updateDir, part.name);
    await downloadAsset(asset, partPath, "gitee", part.size, progressState);
    if (await sha512Base64(partPath) !== part.sha512) {
      await rm(partPath, { force: true });
      throw new Error(`${part.name} 完整性校验失败`);
    }
    partPaths.push(partPath);
  }

  const installerPath = join(updateDir, manifest.filename);
  await rm(installerPath, { force: true });
  for (const partPath of partPaths) {
    await pipeline(createReadStream(partPath), createWriteStream(installerPath, { flags: "a" }));
  }
  if (await sha512Base64(installerPath) !== manifest.sha512) {
    await rm(installerPath, { force: true });
    throw new Error("Gitee 安装包完整性校验失败");
  }
  await Promise.all(partPaths.map((partPath) => rm(partPath, { force: true })));
  return { path: installerPath, version: manifest.version };
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

async function runDownload(preferredSource: UpdateSource): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== "win32") {
    return { ok: false, message: "当前平台请从发行页面手动下载安装包。" };
  }
  downloadedInstallerPath = "";
  downloadedVersion = "";
  send({ kind: "checking" });

  const errors: string[] = [];
  for (const sourceName of updateSourceOrder(preferredSource)) {
    const source = sourceName === "gitee" ? downloadFromGitee : downloadFromGithub;
    try {
      const result = await source();
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

/** Use the selected source first and retry the other mirror on failure. */
export function downloadUpdate(preferredSource: UpdateSource = "github"): Promise<{ ok: boolean; message: string }> {
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
