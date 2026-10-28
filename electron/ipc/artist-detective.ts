import { app, dialog, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getToken, atomicWriteFileSync, getSetting, getSettings } from "./store";
import {featureText} from '../../src/feature-text';
import { toLocalMediaUrl } from "./local-media-protocol";
import { detectiveDownloadStatus } from "./detective-download";
import {detectiveRuntimeChecking, detectiveRuntimeValidation, validateDetectiveRuntime} from './detective-runtime-check';
import {readDetectiveConfig,saveDetectiveConfig,detectiveProfile,updateDetectiveProfile,validDetectiveVariant,type DetectiveConfig,type DetectiveModelVariant} from './detective-models';
import {detectiveDownloadVariant} from './detective-download';
import { detectiveBudget, detectiveParameters, detectiveRounds, detectiveRecoveryLabels, type DetectiveRunRequest, type DetectiveResumeRequest, type DetectiveSnapshot } from "../../src/artist-detective-contract";
import {resolveNovelAiGenerationBaseUrl} from './nai';
import {startDetectiveGenerationBridge} from './detective-generation-bridge';
import {archiveDetectivePause, createDetectiveRunManifest, detectiveOwnedRun, detectiveRecovery, detectiveVerifiedResults, readDetectiveRunManifest, verifyDetectiveRunBinding, type DetectiveBinding, type DetectiveRunManifest} from './detective-run-resume';

import {assertPortableIdle, registerPortableBusy} from './portable-projects';
type Config = DetectiveConfig & {runManifestSha256?:string};
let child: ChildProcess | null = null;
let clearing = false;
let starting = false;
const config=()=>readDetectiveConfig() as Config,save=(value:Config)=>saveDetectiveConfig(value);
function alive(pid?: number) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
registerPortableBusy(()=>!!child || starting || clearing || detectiveRuntimeChecking() || alive(config().pid), 'detective');
function read(file: string): any { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function ready(c: Config) { return !!(c.python && c.assets && fs.existsSync(c.python) && fs.existsSync(path.join(c.assets, "manifest.json"))); }

export function detectiveStatus(): DetectiveSnapshot {
  const c = config(), running = alive(c.pid);
  const status = c.directory ? read(path.join(c.directory, "status.json")) : null;
  const failure = c.directory ? read(path.join(c.directory, "failure.json")) : null;
  const budget = status?.budget ?? 300;
  const reference = c.image && fs.existsSync(c.image) ? { filePath: c.image, fileUrl: toLocalMediaUrl(c.image), name: path.basename(c.image) } : undefined;
  let fixedPrompt = c.directory ? read(path.join(c.directory, "fixed-prompt.json")) : undefined;
  if (!fixedPrompt && c.directory) {
    try { fixedPrompt = JSON.parse(read(path.join(c.directory, "vision-caption.json"))?.content ?? "null"); } catch { /* incomplete vision output */ }
  }
  const candidates: DetectiveSnapshot["candidates"] = [];
  if (c.directory) {
    const search = path.join(c.directory, "search");
    // Fresh-seed validation is the final ranking; never mix it with training-seed maxima.
    const finalReady = fs.existsSync(path.join(search, "finalists.json"));
    if (fs.existsSync(search)) for (const file of fs.readdirSync(search).filter(f => finalReady ? f === "finalists.json" : /^round-\d+\.json$/.test(f))) {
      const data = read(path.join(search, file));
      for (const row of data?.results ?? []) {
        const preview = [...row.renders].sort((a, b) => b.score - a.score)[0];
        if (!preview?.image || !fs.existsSync(preview.image)) continue;
        candidates.push({ image: toLocalMediaUrl(preview.image), score: row.mean_score, phase: row.phase,
          prompt: row.artists.map((a: {tag: string; weight: number}) => `${a.weight}::artist:(${a.tag})::`).join(", ") });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const selectedVariant=c.selectedVariant!,selected={...detectiveProfile(c,selectedVariant),variant:selectedVariant};
  // Status reads (including startup and polling) never launch Python or load a
  // model. Reuse persisted validation; an absent/stale record awaits an action.
  const models=Object.fromEntries((['full','light'] as const).map(v=>{const p=detectiveProfile(c,v);return [v,{...p,configured:ready(p),validation:detectiveRuntimeValidation({...p,variant:v})}];})) as NonNullable<DetectiveSnapshot['models']>;
  return { selectedVariant,activeVariant:c.python&&c.assets?c.variant:undefined,models,ready:ready(selected),runtimeValidation:detectiveRuntimeValidation(selected), running, stage: failure && !running ? (failure.paused ? "paused" : "failed") : status?.stage ?? "idle",
    completed: status?.completed ?? 0, budget, rounds: detectiveRounds(budget),
    best: candidates[0]?.score ?? status?.best, message: failure?.message, directory: c.directory,
    reference, fixedPrompt, recovery:c.directory ? safeRecovery(c) : undefined, candidates: candidates.slice(0, 32) };
}

export async function detectiveConfigure(kind: "python" | "assets") {
  const c = config();
  if (alive(c.pid) || child || starting || clearing || detectiveRuntimeChecking()) throw new Error("请等待当前任务或校验完成。");
  if (kind !== "python" && kind !== "assets") throw new Error("Invalid configuration kind");
  const result = await dialog.showOpenDialog(kind === "python"
    ? { title: featureText(getSetting('language'),"选择已安装 Artist Detective 的 Python 3.12"), properties: ["openFile"], filters: [{ name: "Python", extensions: ["exe"] }] }
    : { title: featureText(getSetting('language'),"选择 novelai-desktop-assets 模型目录"), properties: ["openDirectory"] });
  if (!result.canceled && result.filePaths[0]) {
    assertPortableIdle();
    const latest=config();
    if(alive(latest.pid) || child || starting || clearing || detectiveRuntimeChecking() || detectiveDownloadStatus().busy)throw Error('请等待当前任务或校验完成。');
    if(latest.selectedVariant!==c.selectedVariant)throw Error('模型选择已变化，请重试。');
    save(updateDetectiveProfile(latest,c.selectedVariant!,{[kind]:result.filePaths[0]}));
    await verifyUnseenSelection(c.selectedVariant!);
  }
  return detectiveStatus();
}

function safeRecovery(c:Config) {
  try {detectiveOwnedRun(app.getPath('userData'),c.directory!);return detectiveRecovery(c.directory!,c.runManifestSha256);}
  catch {return {supported:false,message:'当前任务目录无法安全恢复；图片仍保留。'};}
}
function runnerPath() {
  const root=app.getAppPath(),runner=path.join(root.endsWith('.asar')?root+'.unpacked':root,'scripts','artist-detective-live.py');
  if(!fs.existsSync(runner))throw Error('缺少 Artist Detective 运行脚本。');return runner;
}
function runBinding(c:Config):DetectiveBinding {
  const token=getToken();if(!token)throw Error('请先配置 NovelAI API。');
  const settings=getSettings();
  return {python:c.python!,assets:c.assets!,variant:c.variant!,runner:runnerPath(),imageBaseUrl:resolveNovelAiGenerationBaseUrl(),accountId:settings.naiAccountId,token};
}
function assertWorkerIdle() {
  if(child || starting || clearing || alive(config().pid) || detectiveRuntimeChecking() || detectiveDownloadStatus().busy)throw Error('已有画风迭代或校验正在运行。');
}
async function launchRun(c:Config,directory:string,manifest:DetectiveRunManifest,manifestSha256:string,binding:DetectiveBinding,resume=false,authorization?:{requestHash:string;consentId:string;allowUncertainReplay:true}) {
  const completed=resume?detectiveVerifiedResults(directory).count:0;
  if(completed>=manifest.request.budget)throw Error('计划图片已全部保存，请保留结果并检查任务状态，未重发。');
  starting=true;
  let bridge:Awaited<ReturnType<typeof startDetectiveGenerationBridge>>|undefined;
  let launched:ChildProcess|undefined,timer:ReturnType<typeof setInterval>|undefined,startupAborted=false;
  try {
    // Freeze account/endpoint, but allow an explicitly repaired current proxy.
    bridge=await startDetectiveGenerationBridge({imageBaseUrl:binding.imageBaseUrl,token:binding.token,settings:getSettings(),budget:manifest.request.budget-completed});
    verifyDetectiveRunBinding(manifest,runBinding(c));
    if(resume)archiveDetectivePause(directory,randomUUID());
    if(authorization)fs.writeFileSync(path.join(directory,'resume-history',authorization.consentId+'-authorization.json'),JSON.stringify({schema:1,kind:'native-paid-replay-consent',manifestSha256,requestHash:authorization.requestHash,consentId:authorization.consentId,confirmedAt:new Date().toISOString(),possibleExtraPaidAttempt:1,submissionNotObservedHere:true}),{flag:'wx'});
    const log=fs.openSync(path.join(directory,'run.log'),'a');
    try {launched=spawn(binding.python,['-X','utf8','-u',binding.runner],{windowsHide:true,stdio:['pipe',log,log],env:{...process.env,PYTHONUTF8:'1'}});child=launched;}
    finally {fs.closeSync(log);}
    const active=launched,activeBridge=bridge;
    const fail=(message:string)=>atomicWriteFileSync(path.join(directory,'failure.json'),JSON.stringify({message}));
    // Install ownership cleanup before any post-spawn persistence or stdin handoff.
    active.on('error',()=>{try{fail('Python 运行环境启动失败，请检查配置。');}catch{/* A full disk cannot turn into an uncaught event exception. */}});
    active.stdin!.on('error',()=>{/* The close handler records early failure. */});
    active.once('close',code=>{
      if(!startupAborted)void activeBridge.close();
      if(timer)clearInterval(timer);if(child===active)child=null;
      try {
        if(!startupAborted && code!==0 && !fs.existsSync(path.join(directory,'failure.json')))fail('迭代进程提前退出；已生成图片保留。');
        const current=config();if(current.directory===directory && current.pid===active.pid)save({...current,pid:undefined});
      }catch{/* Keep saved outputs and the triggering error if persistence is unavailable. */}
    });
    const deadline=Date.now()+Math.max(3*3600_000,(manifest.request.budget-completed)*180_000+600_000)+60_000;
    timer=setInterval(()=>{if(Date.now()>=deadline)active.kill();},60_000);
    save({...c,directory,pid:active.pid,image:manifest.reference.path,runManifestSha256:manifestSha256});
    atomicWriteFileSync(path.join(directory,'status.json'),JSON.stringify({stage:'loading',completed,budget:manifest.request.budget,resuming:resume}));
    active.stdin!.end(JSON.stringify({output:directory,assets:manifest.runtime.assets,image:manifest.reference.path,...manifest.request,token:binding.token,imageBaseUrl:binding.imageBaseUrl,transportBridge:activeBridge.connection,language:getSetting('language'),...(resume?{resume:true}:{}),...(authorization?{resumeAuthorization:authorization}:{})}));
    return detectiveStatus();
  }catch(error){
    startupAborted=true;if(timer)clearInterval(timer);
    // Only this invocation's child may be aborted; never consult a different PID.
    const failedChild=launched;
    if(failedChild){
      failedChild.once('close',()=>{if(child===failedChild)child=null;});
      failedChild.stdin?.destroy();
      try {failedChild.kill();}catch{/* Preserve the triggering preparation error. */}
    }
    try {await bridge?.close();}catch{/* Preserve the original error, not cleanup noise. */}
    throw error;
  }finally{starting=false;}
}
export async function detectiveStart(value:DetectiveRunRequest) {
  assertPortableIdle();assertWorkerIdle();
  const c=config(),selected={...detectiveProfile(c,c.selectedVariant!),variant:c.selectedVariant};
  if(!ready(selected))throw Error('请先配置 Artist Detective 运行环境和模型目录。');
  if(detectiveRuntimeValidation(selected).state!=='passed')throw Error('请先完成模型与运行环境校验。');
  c.python=selected.python;c.assets=selected.assets;c.variant=c.selectedVariant;
  if(!value || typeof value.image!=='string' || !fs.existsSync(value.image))throw Error('请选择目标图片。');
  if(typeof value.prompt!=='string'||!value.prompt.trim()||value.prompt.length>16000||typeof value.style!=='string'||value.style.length>8000)throw Error('请填写有效的固定内容提示词。');
  detectiveParameters(value.parameters);detectiveBudget(value.budget);
  const binding=runBinding(c),directory=path.join(app.getPath('userData'),'artist-detective-runs',randomUUID());
  fs.mkdirSync(directory,{recursive:true});detectiveOwnedRun(app.getPath('userData'),directory);
  const {manifest,manifestSha256}=createDetectiveRunManifest(directory,value,binding);
  return launchRun(c,directory,manifest,manifestSha256,binding);
}
export async function detectiveResume(request:DetectiveResumeRequest) {
  assertPortableIdle();assertWorkerIdle();
  const initial=config();
  if(!request || typeof request.directory!=='string' || typeof request.manifestSha256!=='string' || request.directory!==initial.directory || request.manifestSha256!==initial.runManifestSha256)throw Error('当前迭代任务已变化，请刷新后重试。');
  const directory=detectiveOwnedRun(app.getPath('userData'),request.directory);
  const manifest=readDetectiveRunManifest(directory,request.manifestSha256),binding=runBinding(initial);
  if(detectiveRuntimeValidation({python:initial.python,assets:initial.assets,variant:initial.variant}).state!=='passed')throw Error('原运行环境需要重新校验，尚未恢复任务。');
  verifyDetectiveRunBinding(manifest,binding);
  const recovery=detectiveRecovery(directory,request.manifestSha256);
  if(!recovery.supported || recovery.pendingRequestHash!==request.pendingRequestHash)throw Error(recovery.message??'未完成请求已改变，请刷新后重试。');
  let authorization:{requestHash:string;consentId:string;allowUncertainReplay:true}|undefined;
  starting=true;
  try {
    if(recovery.requiresPaidReplayConfirmation) {
      if(!recovery.pendingRequestHash)throw Error('未完成请求记录缺失，未重发。');
      const text=detectiveRecoveryLabels(getSetting('language'));
      const answer=await dialog.showMessageBox({type:'warning',title:text.title,message:text.warning,detail:'请求 SHA-256：'+recovery.pendingRequestHash,buttons:[text.cancel,text.confirm],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)throw Error('已取消恢复；原图片和任务保留。');
      authorization={requestHash:recovery.pendingRequestHash,consentId:randomUUID(),allowUncertainReplay:true};
    }
    const current=config();
    if(child||clearing||alive(current.pid)||detectiveRuntimeChecking()||detectiveDownloadStatus().busy||current.directory!==directory||current.runManifestSha256!==request.manifestSha256)throw Error('当前迭代任务已变化，请刷新后重试。');
    const currentManifest=readDetectiveRunManifest(directory,request.manifestSha256),latestRecovery=detectiveRecovery(directory,request.manifestSha256);
    verifyDetectiveRunBinding(currentManifest,runBinding(current));
    if(!latestRecovery.supported||latestRecovery.pendingRequestHash!==recovery.pendingRequestHash||latestRecovery.requiresPaidReplayConfirmation!==recovery.requiresPaidReplayConfirmation)throw Error('未完成请求已改变，未重发。');
    return await launchRun(current,directory,currentManifest,request.manifestSha256,runBinding(current),true,authorization);
  }finally{starting=false;}
}

export function detectiveStop() {
  const c = config();
  if (c.directory && alive(c.pid)) fs.writeFileSync(path.join(c.directory, "STOP"), "stop after current request\n");
  return detectiveStatus();
}
export async function detectiveOpenResults() {
  const c = config();
  if (c.directory && fs.existsSync(c.directory)) await shell.openPath(c.directory);
}

export async function detectiveVerifyRuntime() {
  assertPortableIdle();
  const c=config();
  if(child || starting || clearing || alive(c.pid) || detectiveDownloadStatus().busy) throw Error('请等待当前任务结束。');
  await verifySelected(c.selectedVariant!,true);
  return detectiveStatus();
}

async function verifySelected(variant:DetectiveModelVariant,force=false) {
  const profile=detectiveProfile(config(),variant);
  const result=await validateDetectiveRuntime({...profile,variant},force);
  const latest=config(),current=detectiveProfile(latest,variant);
  if(result.state==='passed' && latest.selectedVariant===variant && current.python===profile.python && current.assets===profile.assets)
    save({...latest,python:profile.python,assets:profile.assets,variant});
  return result;
}
async function verifyUnseenSelection(variant:DetectiveModelVariant) {
  const selected={...detectiveProfile(config(),variant),variant};
  // Only explicit configuration/selection may initiate a first check. Passed
  // profiles survive restarts; failed checks require the manual retry button.
  if(ready(selected) && detectiveRuntimeValidation(selected).state==='unchecked')
    await verifySelected(variant);
}
export function detectiveSelectModel(value:DetectiveModelVariant) {
  assertPortableIdle();
  const c=config();
  if(!validDetectiveVariant(value))throw Error('Invalid model variant');
  if(child||starting||clearing||alive(c.pid)||detectiveRuntimeChecking()||detectiveDownloadStatus().busy)throw Error('请等待当前任务或校验完成。');
  detectiveDownloadVariant(value);
  const latest=config();save({...latest,selectedVariant:value});
  const p=detectiveProfile(latest,value);
  if(detectiveRuntimeValidation({...p,variant:value}).state==='passed')save({...config(),python:p.python,assets:p.assets,variant:value});
  void verifyUnseenSelection(value).catch(()=>{});
  return detectiveStatus();
}

/** Enumerate only this run's generated spool PNGs; never delete an entire folder. */
function generatedImages(directory:string,reference?:string) {
  if(!fs.existsSync(directory))return [];
  const root=fs.realpathSync(directory);
  const check=(file:string)=>{
    const relative=path.relative(root,fs.realpathSync(file));
    if(fs.lstatSync(file).isSymbolicLink() || relative.startsWith('..') || path.isAbsolute(relative))throw Error('结果路径包含外部链接，已停止清空。');
  };
  const spool=path.join(root,'spool'),results=path.join(spool,'results');
  if(!fs.existsSync(results))return [];
  check(spool);check(results);
  const files:string[]=[];
  for(const entry of fs.readdirSync(results,{withFileTypes:true})) {
    const folder=path.join(results,entry.name);check(folder);
    if(!entry.isDirectory())continue;
    for(const name of fs.readdirSync(folder)) {
      const file=path.join(folder,name);check(file);
      if(!/^[a-f0-9]{64}\.png$/i.test(name)||!fs.statSync(file).isFile())continue;
      if(reference && fs.existsSync(reference) && fs.realpathSync(reference)===fs.realpathSync(file))continue;
      files.push(file);
    }
  }
  return files;
}
export async function detectiveClearResults(request:{directory:string;deleteImages:boolean}) {
  assertPortableIdle();
  const c=config();
  if(child || starting || clearing || alive(c.pid))throw Error('请先停止当前迭代。');
  if(!request || typeof request.directory!=='string' || typeof request.deleteImages!=='boolean' || !c.directory || path.resolve(c.directory)!==path.resolve(request.directory))throw Error('当前迭代结果已变化，请刷新后重试。');
  clearing=true;
  try {
    const files=request.deleteImages?generatedImages(c.directory,c.image):[];
    const root=files.length?fs.realpathSync(c.directory):'';
    for(const file of files){
      const relative=path.relative(root,fs.realpathSync(file));
      if(relative.startsWith('..')||path.isAbsolute(relative)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw Error('图片路径已变化，已停止清空。');
      await shell.trashItem(file);
    }
    const latest=config();
    if(latest.directory!==c.directory)throw Error('当前迭代结果已变化，请刷新后重试。');
    save({...latest,directory:undefined,pid:undefined});
  } finally {clearing=false;}
  return detectiveStatus();
}
