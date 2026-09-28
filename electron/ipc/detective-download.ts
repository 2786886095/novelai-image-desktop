import { app, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import axios from "axios";
import { proxyConfig } from "./proxy";
import { getSetting } from "./store";
import {featureText} from '../../src/feature-text';
import release from "./detective-release.json";
import {detectiveRuntimeChecking,validateDetectiveRuntime,cancelDetectiveRuntimeCheck} from './detective-runtime-check';
import {readDetectiveConfig,saveDetectiveConfig,detectiveProfile,updateDetectiveProfile} from './detective-models';

const execute = (file: string, args: string[], options: ExecFileOptions) => promisify(execFile)(file, args, options);
const REPO = "https://huggingface.co/langbai666/novelai-studio-artist-detective";
export const packageUrl = (file: string) => `${REPO}/resolve/main/${encodeURIComponent(file)}`;
export type DownloadStage = "idle" | "downloading" | "verifying" | "extracting" | "checking" | "complete" | "failed" | "cancelled";
export type DetectiveVariant = "full" | "light";
type Package = { file: string; bytes: number; sha256: string; kind: string; variant?: DetectiveVariant; directory?: string };
function chosenVariant(): DetectiveVariant {
  return readDetectiveConfig().selectedVariant ?? 'full';
}
const packages = () => (release.packages as Package[]).filter(p => p.kind === "runtime" || !p.variant || p.variant === chosenVariant());
export interface DetectiveDownloadStatus {
  variant: DetectiveVariant;
  stage: DownloadStage; busy: boolean; directory: string; file: string;
  downloaded: number; total: number; bytesPerSecond: number; message: string;
  packages: { file: string; bytes: number; sha256: string; url: string }[];
  repository: string;
}
let job: Promise<void> | null = null;
let controller: AbortController | null = null;
type DownloadState={stage:DownloadStage;file:string;downloaded:number;bytesPerSecond:number;message:string};
const states=new Map<string,DownloadState>();
function currentState():DownloadState {
  const key=app.getPath('userData')+'|'+chosenVariant();
  if(!states.has(key))states.set(key,{stage:'idle',file:'',downloaded:0,bytesPerSecond:0,message:''});
  return states.get(key)!;
}
let state:DownloadState={stage:'idle',file:'',downloaded:0,bytesPerSecond:0,message:''};
function directory() {
  const c=readDetectiveConfig(),v=chosenVariant(),p=detectiveProfile(c,v);
  if(p.downloadDirectory && path.isAbsolute(p.downloadDirectory))return p.downloadDirectory;
  return path.join(app.getPath("userData"), "artist-detective-downloads",v);
}
export function detectiveDownloadStatus(): DetectiveDownloadStatus {
  return { ...currentState(), variant: chosenVariant(), busy: !!job, directory: directory(), total: packages().reduce((a, p) => a + p.bytes, 0),
    packages: packages().map(p => ({ ...p, url: packageUrl(p.file) })), repository: REPO };
}
export function detectiveDownloadVariant(value: DetectiveVariant) {
  if (job) throw new Error("请先取消当前下载，再切换模型版本。");
  if (value !== "full" && value !== "light") throw new Error("Invalid model variant");
  if(detectiveRuntimeChecking())throw Error('请等待模型与运行环境校验完成。');
  const c=readDetectiveConfig();
  saveDetectiveConfig({...c,downloadVariant:value,selectedVariant:value});
  return detectiveDownloadStatus();
}
export async function verifyDownload(file: string, bytes: number, expected: string, signal?: AbortSignal) {
  if ((await fs.promises.stat(file)).size !== bytes) throw new Error("下载文件大小不符");
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) { signal?.throwIfAborted(); hash.update(chunk); }
  if (hash.digest("hex") !== expected) throw new Error("下载文件 SHA-256 校验失败");
}
export async function detectiveDownloadDirectory() {
  if (job) throw new Error("请先取消当前下载");
  const result = await dialog.showOpenDialog({ title: featureText(getSetting('language'),"选择模型与运行环境存放位置"), properties: ["openDirectory", "createDirectory"] });
  if (!result.canceled && result.filePaths[0]) {
    const c=readDetectiveConfig();saveDetectiveConfig(updateDetectiveProfile(c,chosenVariant(),{downloadDirectory:result.filePaths[0]}));
  }
  return detectiveDownloadStatus();
}
export function detectiveDownloadCancel() { controller?.abort(); if(job&&state.stage==='checking')cancelDetectiveRuntimeCheck(); return detectiveDownloadStatus(); }
export function validateRange(header: unknown, offset: number, total: number) {
  return typeof header === "string" && header.startsWith(`bytes ${offset}-`) && header.endsWith(`/${total}`);
}
async function download(p: Package, root: string, before: number, signal: AbortSignal) {
  const final = path.join(root, p.file), pending = final + ".part";
  if (fs.existsSync(final)) {
    state.stage = "verifying";
    try { await verifyDownload(final, p.bytes, p.sha256, signal); state.downloaded = before + p.bytes; return final; }
    catch { signal.throwIfAborted(); await fs.promises.rename(final, `${final}.invalid-${Date.now()}`); }
  }
  let offset = fs.existsSync(pending) ? (await fs.promises.stat(pending)).size : 0;
  if (offset > p.bytes) { await fs.promises.truncate(pending, 0); offset = 0; }
  state.downloaded = before + offset;
  if (offset < p.bytes) {
    state.stage = "downloading";
    const response = await axios.get(packageUrl(p.file), { ...proxyConfig("ai"), responseType: "stream", timeout: 60000,
      signal, maxRedirects: 8, headers: offset ? { Range: `bytes=${offset}-` } : {} });
    if (offset && response.status === 206 && !validateRange(response.headers["content-range"], offset, p.bytes)) {
      response.data.destroy(); throw new Error("断点响应范围不符，请重试");
    }
    if (response.status === 200) offset = 0;
    else if (response.status !== 206 || !validateRange(response.headers["content-range"], offset, p.bytes)) {
      response.data.destroy(); throw new Error("下载响应异常");
    }
    const handle = await fs.promises.open(pending, offset ? "a" : "w");
    let current = offset, lastBytes = offset, lastAt = Date.now();
    try {
      for await (const chunk of response.data) {
        signal.throwIfAborted();
        current += chunk.length;
        if (current > p.bytes) throw new Error("响应超过预期文件大小");
        await handle.writeFile(chunk);
        state.downloaded = before + current;
        const now = Date.now();
        if (now - lastAt >= 250) { state.bytesPerSecond = (current - lastBytes) * 1000 / (now - lastAt); lastAt = now; lastBytes = current; }
      }
    } finally { await handle.close(); response.data.destroy(); }
  }
  signal.throwIfAborted(); state.stage = "verifying"; state.bytesPerSecond = 0;
  try { await verifyDownload(pending, p.bytes, p.sha256, signal); }
  catch (error) { signal.throwIfAborted(); await fs.promises.rename(pending, `${pending}.invalid-${Date.now()}`); throw error; }
  await fs.promises.rename(pending, final); return final;
}
export function detectiveDownloadStart() {
  if (job) return detectiveDownloadStatus();
  if (detectiveRuntimeChecking()) throw Error('请等待模型与运行环境校验完成。');
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("此运行包支持 Windows x64");
  let current=readDetectiveConfig();
  if (typeof current.pid === "number") {
    let running = false; try { process.kill(current.pid, 0); running = true; } catch { /* finished */ }
    if (running) throw new Error("请先停止画风迭代，再安装环境");
  }
  controller = new AbortController(); const signal = controller.signal, root = directory();
  const chosen = packages(), variant = chosenVariant();
  state=currentState();Object.assign(state,{ stage: "downloading", file: "", downloaded: 0, bytesPerSecond: 0, message: "" });
  job = (async () => {
    await fs.promises.mkdir(root, { recursive: true });
    let before = 0; const archives: string[] = [];
    for (const p of chosen) { state.file = p.file; archives.push(await download(p, root, before, signal)); before += p.bytes; }
    signal.throwIfAborted(); state.stage = "extracting"; state.bytesPerSecond = 0;
    const install = path.join(root, `${release.version}-${variant}-${Date.now()}`);
    await fs.promises.mkdir(install);
    for (const file of archives) {
      state.file = path.basename(file); signal.throwIfAborted();
      // Only locally pinned, SHA-256-verified release archives reach the extractor.
      await execute("tar.exe", ["-xf", file, "-C", install], { windowsHide: true, timeout: 30 * 60_000, signal, maxBuffer: 1024 * 1024 });
    }
    state.stage = "checking"; state.file = "Python / CUDA / 模型清单";
    const python = path.join(install, "python", "python.exe"), assets = path.join(install, chosen.find(p => p.kind === "assets")?.directory ?? "novelai-desktop-assets");
    const verified=await validateDetectiveRuntime({python,assets,variant},true);
    if(verified.state!=='passed')throw Error(verified.message??'Model verification failed');
    signal.throwIfAborted();
    // Re-read to preserve any new user settings made while downloading.
    current=readDetectiveConfig();
    const next=updateDetectiveProfile(current,variant,{python,assets});
    saveDetectiveConfig({...next,...(next.selectedVariant===variant?{python,assets,variant}:{})});
    state.stage = "complete"; state.message = "运行环境与模型校验通过，已切换到新版资源。原图片与历史记录保留。";
  })().catch(() => {
    const at = state.stage;
    state.stage = signal.aborted ? "cancelled" : "failed";
    state.message = signal.aborted ? "下载已取消，已下载内容保留，可继续下载。" : `安装在 ${at} 阶段失败：请检查网络、磁盘空间、NVIDIA 驱动${variant === "full" ? "与至少 8GB 显存" : "及可用显存"}；原运行环境和模型配置未替换，可重试。`;
  }).finally(() => { state.bytesPerSecond = 0; job = null; controller = null; });
  return detectiveDownloadStatus();
}
