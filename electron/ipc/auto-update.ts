import { assertUpdateOutputProtection } from "./update-output-protection";
import { installedAppDir } from "./app-mode";
import { readStore } from "./store";
import { app } from "electron";
import type { BrowserWindow } from "electron";
import axios from "axios";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rm, lstat } from "fs/promises";
import { basename, join } from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import type { UpdateProgressEvent } from "../../src/types";
import { proxyConfig } from "./proxy";
import {
  latestGithubRelease,
  compareVersions,
  type RemoteReleaseAsset,
} from "./update";
import type {AppUpdateAdapter,AppUpdatePlan} from './agent-app-update';


let getMainWindow: (() => BrowserWindow | null) | undefined;
let prepareInstall: () => Promise<void> = async () => {};
let installFailed:()=>void=()=>{};
let downloadedInstallerPath = "";
let downloadedVersion = "";
let downloadInFlight: Promise<{ ok: boolean; message: string }> | null = null;
let installLaunchInFlight = false;
let automaticInstallTimer: NodeJS.Timeout | null = null;
let updateLease:symbol|null=null;
let downloadedSha512='';
const trustedPlans=new WeakMap<AppUpdatePlan,RemoteReleaseAsset>();

export function reserveAppUpdate():symbol {
 if(updateLease||downloadInFlight||installLaunchInFlight||automaticInstallTimer)throw Error('已有软件更新任务');
 return updateLease=Symbol('app-update');
}
export function releaseAppUpdate(lease:symbol){if(updateLease===lease)updateLease=null;}
export function appUpdateBusy(){return Boolean(updateLease||downloadInFlight||installLaunchInFlight||automaticInstallTimer);}

function send(payload: UpdateProgressEvent) {
  const mainWindow = getMainWindow?.();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send("app:updateEvent", payload);
}

/** Retains the existing startup wiring contract used by electron/main.ts. */
export function wireAutoUpdater(getWindow: () => BrowserWindow | null, beforeInstall: () => Promise<void> = async () => {},onInstallFailure:()=>void=()=>{}) {
  getMainWindow = getWindow;
  prepareInstall = beforeInstall;
  installFailed=onInstallFailure;
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
  signal?:AbortSignal,
  progress?:(percent:number)=>void,
) {
  validateDownloadUrl(asset.url, _source);
  const response = await axios.get(asset.url, {
    responseType: "stream",
    timeout: 60_000,
    maxRedirects: 8,
    headers: { Accept: "application/octet-stream" },
    ...proxyConfig("update"),
    signal,
  });
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if(expectedSize>0&&received>expectedSize){callback(new Error('更新文件超出清单大小'));return;}
      const percent = progressState.total > 0
        ? Math.min(99, Math.round(((progressState.completed + received) / progressState.total) * 100))
        : 0;
      send({ kind: "progress", percent });
      progress?.(percent);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(response.data, meter, createWriteStream(destination),{signal});
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

async function readTextAsset(asset: RemoteReleaseAsset, _source: "github",signal?:AbortSignal): Promise<string> {
  validateDownloadUrl(asset.url, _source);
  const response = await axios.get(asset.url, {
    responseType: "text",
    maxContentLength:64*1024,
    timeout: 20_000,
    maxRedirects: 8,
    headers: { Accept: "application/json, text/yaml, text/plain, */*" },
    ...proxyConfig("update"),
    signal,
  });
  return String(response.data ?? "");
}

function parseLatestYamlSha512(payload: string): string {
  const match = payload.match(/^sha512\s*:\s*["']?([^\s"']+)["']?\s*$/im);
  return match?.[1] ?? "";
}

export async function planAppUpdate(signal?:AbortSignal):Promise<AppUpdatePlan>{
  signal?.throwIfAborted();
  const release = await latestGithubRelease();
  signal?.throwIfAborted();
  if(!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(release.version))throw Error('发行版本格式无效');
  const setup = release.assets.find((asset) => /^Langbai-NovelAI-Studio-Setup-[\w.+-]+\.exe$/i.test(asset.name));
  if (!setup) throw new Error("GitHub 发行版缺少 Windows 安装包");
  const yaml = findAsset(release.assets, "latest.yml");
  const manifest=await readTextAsset(yaml, "github",signal);
  const expectedHash = parseLatestYamlSha512(manifest);
  if (!/^[A-Za-z0-9+/]{86}==$/.test(expectedHash)) throw new Error("GitHub 更新清单缺少完整性校验值");
  const manifestVersion=/^version:\s*["']?([^\s"']+)/m.exec(manifest)?.[1];
  const manifestPath=/^path:\s*["']?([^\r\n"']+)/m.exec(manifest)?.[1]?.trim();
  if(manifestVersion!==release.version||manifestPath!==setup.name||setup.name!==`Langbai-NovelAI-Studio-Setup-${release.version}.exe`)throw Error('发行版与更新清单版本或安装包不一致');
  if(!Number.isSafeInteger(setup.size)||!setup.size||setup.size>2*1024*1024*1024)throw Error('安装包大小无效');
  validateDownloadUrl(setup.url,'github');
  const plan=Object.freeze({version:release.version,bytes:setup.size,sha512:expectedHash,sourceUrl:setup.url});
  trustedPlans.set(plan,{...setup});return plan;
}

async function downloadPlan(plan:AppUpdatePlan,signal?:AbortSignal,progress?:(percent:number)=>void):Promise<{path:string;version:string}>{
  const setup=trustedPlans.get(plan);if(!setup)throw Error('更新计划不是本机查询结果');
  signal?.throwIfAborted();

  const updateDir = join(app.getPath("temp"), "langbai-novelai-update", plan.version);
  await mkdir(updateDir, { recursive: true });
  const installerPath = join(updateDir, safeAssetName(setup.name));
  const expectedSize = setup.size ?? 0;
  await downloadAsset(
    setup,
    installerPath,
    "github",
    expectedSize,
    { completed: 0, total: expectedSize },
    signal,progress,
  );
  signal?.throwIfAborted();
  if (await sha512Base64(installerPath) !== plan.sha512) {
    await rm(installerPath, { force: true });
    throw new Error("GitHub 安装包完整性校验失败");
  }
  downloadedSha512=plan.sha512;
  return { path: installerPath, version: plan.version };
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
      const result = await downloadPlan(await planAppUpdate());
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
  if(updateLease||installLaunchInFlight)return Promise.resolve({ok:false,message:'软件更新已交接，请等待当前任务完成'});
  if(automaticInstallTimer)return Promise.resolve({ok:true,message:'安装包已验证，正在准备自动安装'});
  if (!downloadInFlight) {
    downloadInFlight = runDownload(preferredSource).finally(() => {
      downloadInFlight = null;
    });
  }
  return downloadInFlight;
}

/** Silent upgrade; NSIS retains the registered installation scope and directory. */
export function automaticInstallerArgs(): string[] {
  return ["/S", "--updated", "--force-run"];
}

function scheduleAutomaticInstall() {
  if (automaticInstallTimer) clearTimeout(automaticInstallTimer);
  automaticInstallTimer = setTimeout(() => {
    automaticInstallTimer = null;
    void installUpdate();
  }, 850);
}

/** Install the verified download without the interactive first-install wizard. */
export async function installUpdate(lease?:symbol,signal?:AbortSignal,onStarted?:()=>Promise<void>) {
  if(updateLease&&updateLease!==lease)throw Error('软件更新由已批准任务独占');
  if (process.platform !== "win32" || !downloadedInstallerPath || installLaunchInFlight) {if(lease)throw Error('当前没有可安装的软件更新');return;}
  try { assertUpdateOutputProtection(installedAppDir(), readStore(), {installerMigratesWorkspace:true}); }
  catch (error) { send({ kind: "error", message: error instanceof Error ? error.message : String(error) }); if(lease)throw error;return; }
  installLaunchInFlight = true;
  let processStarted=false;
  try {
    signal?.throwIfAborted();
    const verify=async()=>{const stat=await lstat(downloadedInstallerPath);if(!stat.isFile()||stat.isSymbolicLink()||!downloadedSha512||await sha512Base64(downloadedInstallerPath)!==downloadedSha512)throw Error('已下载安装包发生变化，未启动安装');};
    await verify();
    await prepareInstall();
    signal?.throwIfAborted();await verify();
    // Settings may change while the runtime is stopping.
    assertUpdateOutputProtection(installedAppDir(), readStore(), {installerMigratesWorkspace:true});
    signal?.throwIfAborted();
    const child = spawn(downloadedInstallerPath, automaticInstallerArgs(), {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    let resolveLaunch!:()=>void,rejectLaunch!:(error:Error)=>void;
    const launched=onStarted?new Promise<void>((resolve,reject)=>{resolveLaunch=resolve;rejectLaunch=reject;}):null;
    child.once("error", (error) => {
      if(!processStarted){installLaunchInFlight = false;installFailed();}
      send({ kind: "error", message: `自动安装启动失败：${error.message}` });
      rejectLaunch?.(error);
    });
    child.once("spawn", () => {
      processStarted=true;
      console.info(`[update] launching verified silent installer for ${downloadedVersion}`);
      void (async()=>{try{await onStarted?.();resolveLaunch?.();setTimeout(() => app.quit(), 450);}catch(error){rejectLaunch?.(error instanceof Error?error:Error(String(error)));send({kind:'error',message:'安装已启动，但交接记录保存失败，请核对安装结果。'});}})();
    });
    child.unref();
    if(launched)await launched;
  } catch (error) {
    if(!processStarted){installLaunchInFlight = false;installFailed();}
    send({kind: "error", message: `自动安装启动失败：${error instanceof Error ? error.message : String(error)}`});
    if(lease)throw error;
  }
}

/** Uses exactly the immutable plan shown in Agent approval; never fetches a new latest release. */
export function desktopAppUpdateAdapter(log:(message:string)=>void):AppUpdateAdapter {
 let lease:symbol|undefined;
 return {currentVersion:()=>app.getVersion(),supported:()=>process.platform==='win32',busy:appUpdateBusy,
  plan:async signal=>{const plan=await planAppUpdate(signal);return compareVersions(plan.version,app.getVersion())>0?plan:null;},
  reserve:()=>{lease=reserveAppUpdate();},release:()=>{
   if(lease&&updateLease===lease&&!installLaunchInFlight){
    // Cancellation/failure invalidates the prepared capability, not just the
    // lease. A stale settings-page Install button must not run a cancelled job.
    downloadedInstallerPath='';downloadedVersion='';downloadedSha512='';
    send({kind:'error',message:'软件更新已停止；未启动安装。'});
   }
   if(lease)releaseAppUpdate(lease);lease=undefined;
  },
  download:async(plan,signal,progress)=>{
   if(!lease||updateLease!==lease)throw Error('更新任务未取得独占交接');
   assertUpdateOutputProtection(installedAppDir(),readStore(),{installerMigratesWorkspace:true});
   downloadedInstallerPath='';downloadedVersion='';downloadedSha512='';
   const result=await downloadPlan(plan,signal,progress);signal.throwIfAborted();
   downloadedInstallerPath=result.path;downloadedVersion=result.version;
   progress(100);send({kind:'progress',percent:100});send({kind:'downloaded',version:result.version});
  },
  install:async(plan,signal,onStarted)=>{if(!lease||updateLease!==lease||downloadedVersion!==plan.version)throw Error('待安装版本与已批准版本不一致');await installUpdate(lease,signal,onStarted);},log,
 };
}
