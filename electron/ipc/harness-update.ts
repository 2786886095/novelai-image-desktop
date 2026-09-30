import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import {updateFetch as fetch} from './download-request';
import {chooseComponent} from './harness-update-check';
import {safeBundlePath, validateManifest} from './harness-policy';

/** Remove only a downloader-owned staging directory after successful activation. */
export async function discardHarnessDownload(root:string, source:string) {
  const parent=path.resolve(root,'downloads'),candidate=path.resolve(source);
  if(path.dirname(candidate)!==parent||!/^[a-f0-9]{16}$/.test(path.basename(candidate)))return false;
  const normalize=(p:string)=>process.platform==='win32'?p.toLowerCase():p;
  if((await fs.lstat(parent)).isSymbolicLink()||(await fs.lstat(candidate)).isSymbolicLink())return false;
  const canonicalParent=await fs.realpath(parent);
  if(normalize(await fs.realpath(candidate))!==normalize(path.join(canonicalParent,path.basename(candidate))))return false;
  let receipt:{manifestSha256?:string};
  try{receipt=JSON.parse(await fs.readFile(path.join(candidate,'.studio-download.json'),'utf8'));}
  catch{return false;}
  const manifest=await fs.readFile(path.join(candidate,'manifest.json'));
  if(receipt.manifestSha256!==crypto.createHash('sha256').update(manifest).digest('hex'))return false;
  await fs.rm(candidate,{recursive:true,force:false});
  return true;
}

/** Independent component releases, NOT upstream npm latest and NOT the application's updater. */
export async function queryCompatibleHarness(signal: AbortSignal) {
  const headers={'Accept':'application/vnd.github+json','User-Agent':'Langbai-Tavern-Agent'};
  type Release={tag_name:string;draft:boolean;prerelease:boolean;assets:Array<{name:string;url:string;digest?:string;size:number}>};
  const releases:Release[]=[];
  for(let page=1;page<=5;page++){
  const response=await fetch('https://api.github.com/repos/2786886095/novelai-image-desktop/releases?per_page=100&page='+page,{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
  if(!response.ok)throw new Error(`Agent 更新源 HTTP ${response.status}，现有组件未改变。`);
  const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid release list');releases.push(...rows);if(rows.length<100)break;
  }
  const selected=chooseComponent(releases);
  const assetName=`tavern-agent-${process.platform}-${process.arch}-protocol1.zip`;
  const release=releases.find(r=>r.tag_name===`agent-v${selected}`);
  if(!release)return null;
  const asset=release.assets.find(a=>a.name===assetName)!;
  if(!asset.digest?.match(/^sha256:[a-f0-9]{64}$/) || !Number.isSafeInteger(asset.size) || asset.size<=0 || asset.size>768*1024*1024)throw new Error('Agent 更新包缺少可信摘要或体积异常。');
  return {version: selected!, bytes: asset.size, asset, tag: release.tag_name};
}

export type HarnessDownload = NonNullable<Awaited<ReturnType<typeof queryCompatibleHarness>>>;
/** Bound inactivity separately from total time so a progressing slow download
 * is not killed after five minutes. User stop always takes precedence. */
export function componentDownloadDeadline(parent:AbortSignal,idleMs=120000,totalMs=3600000) {
  const controller=new AbortController();
  let idle:ReturnType<typeof setTimeout>;
  const reset=()=>{clearTimeout(idle);if(!controller.signal.aborted)idle=setTimeout(()=>controller.abort(new Error('Agent 下载连续两分钟无数据，请检查网络后重试；现有组件未改变。')),idleMs);};
  const total=setTimeout(()=>controller.abort(new Error('Agent 下载达到总时限，请检查网络后重试；现有组件未改变。')),totalMs);
  const abort=()=>controller.abort(parent.reason);
  parent.addEventListener('abort',abort,{once:true});
  if(parent.aborted)abort();else reset();
  return {signal:controller.signal,progress:reset,dispose(){clearTimeout(idle);clearTimeout(total);parent.removeEventListener('abort',abort);}};
}
export async function downloadCompatibleHarness(root:string, signal:AbortSignal, log:(text:string)=>void, approved?:HarnessDownload) {
  const selected=approved ?? await queryCompatibleHarness(signal);if(!selected)return null;
  const {asset}=selected,release={tag_name:selected.tag};
  const headers={'Accept':'application/vnd.github+json','User-Agent':'Langbai-Tavern-Agent'};
  log(`下载独立组件 ${release.tag_name}…`);
  if(!asset.url.startsWith('https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/'))throw new Error('Unexpected update source');
  const deadline=componentDownloadDeadline(signal);
  let bytes:Buffer;
  try {
  const chunks:Uint8Array[]=[];let total=0,lastPercent=-5;
  // Resume transient transport failures inside this one approved download. Do
  // not replay installation/approval, or retry user stop / invalid data / HTTP errors.
  for(let attempt=0;attempt<3;attempt++){
    try{
      deadline.signal.throwIfAborted();
      const offset=total;
      const download=await fetch(asset.url,{headers:{...headers,Accept:'application/octet-stream',...(offset?{Range:`bytes=${offset}-`}:{})},signal:deadline.signal});
      if(![200,206].includes(download.status)||!download.body)throw new Error(`下载失败 HTTP ${download.status}`);
      if(download.status===206){
        const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(download.headers.get('content-range')??'');
        if(!range||Number(range[1])!==offset||Number(range[2])!==asset.size-1||Number(range[3])!==asset.size){await download.body.cancel();throw Error('Agent 断点响应范围不符，未安装。');}
      }else if(offset){chunks.length=0;total=0;lastPercent=-5;}
      for await(const chunk of download.body as unknown as AsyncIterable<Uint8Array>){
        deadline.signal.throwIfAborted();if(chunk.length)deadline.progress();total+=chunk.length;if(total>asset.size)throw new Error('Update size mismatch');chunks.push(chunk);
        const percent=Math.floor(total/asset.size*100);
        if(percent>=lastPercent+5){lastPercent=percent;log(`Agent 下载 ${percent}%（${(total/1048576).toFixed(1)} / ${(asset.size/1048576).toFixed(1)} MiB）`);}
      }
      break;
    }catch(error){
      deadline.signal.throwIfAborted();
      if(!(error instanceof TypeError)||attempt===2)throw error;
      log(`Agent 下载连接中断，继续传输已确认的同一组件（${attempt+1}/2；已接收 ${(total/1048576).toFixed(1)} MiB）`);
    }
  }
  bytes=Buffer.concat(chunks);
  chunks.length=0;
  } finally {deadline.dispose();}
  signal.throwIfAborted();
  if(bytes.length!==asset.size || `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`!==asset.digest)throw new Error('Agent 更新包摘要校验失败。');
  const zip=await JSZip.loadAsync(bytes);
  const rawManifest=zip.file('manifest.json');if(!rawManifest)throw new Error('Missing component manifest');
  const manifest=validateManifest(JSON.parse(await rawManifest.async('string')));
  if(`agent-v${manifest.version}`!==release.tag_name)throw new Error('Release/manifest version mismatch');
  const staging=path.join(root,'downloads',crypto.randomBytes(8).toString('hex'));
  await fs.mkdir(staging,{recursive:true});let inflated=0,completed=0;
  const count=Object.keys(manifest.files).length;let lastExtract=0;
  try{
  for(const name of Object.keys(manifest.files)){
    signal.throwIfAborted();const file=zip.file(name);if(!file)throw new Error(`Missing ${name}`);
    const entry=file as typeof file & {unsafeOriginalName?:string};
    if(entry.unsafeOriginalName && entry.unsafeOriginalName!==name)throw new Error('Unsafe archive path');
    const target=safeBundlePath(staging,name);const data=await file.async('nodebuffer');
    inflated+=data.length;if(inflated>2*1024*1024*1024)throw new Error('Expanded component too large');
    if(crypto.createHash('sha256').update(data).digest('hex')!==manifest.files[name])throw new Error(`Component integrity mismatch: ${name}`);
    signal.throwIfAborted();
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
    const percent=Math.floor(++completed/count*100);
    if(percent>=lastExtract+10){lastExtract=percent;log(`Agent 解压校验 ${percent}%（${completed}/${count}）`);}
  }
  signal.throwIfAborted();
  const serialized=JSON.stringify(manifest);
  await fs.writeFile(path.join(staging,'manifest.json'),serialized);
  await fs.writeFile(path.join(staging,'.studio-download.json'),JSON.stringify({manifestSha256:crypto.createHash('sha256').update(serialized).digest('hex')}));
  return staging;
  }catch(error){
    // This uniquely created staging directory is never an installed engine or user home.
    await fs.rm(staging,{recursive:true,force:true});throw error;
  }
}
