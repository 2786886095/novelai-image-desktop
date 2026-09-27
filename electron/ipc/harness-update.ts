import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import {chooseComponent} from './harness-update-check';
import {safeBundlePath, validateManifest} from './harness-policy';

/** Independent component releases, NOT upstream npm latest and NOT the application's updater. */
export async function downloadCompatibleHarness(root: string, signal: AbortSignal, log:(text:string)=>void) {
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
  if(!release){log('尚无已发布的兼容 Agent 组件更新。');return null;}
  const asset=release.assets.find(a=>a.name===assetName)!;
  if(!asset.digest?.match(/^sha256:[a-f0-9]{64}$/) || asset.size>768*1024*1024)throw new Error('Agent 更新包缺少可信摘要或体积异常。');
  log(`下载独立组件 ${release.tag_name}…`);
  if(!asset.url.startsWith('https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/'))throw new Error('Unexpected update source');
  const download=await fetch(asset.url,{headers:{...headers,Accept:'application/octet-stream'},signal:AbortSignal.any([signal,AbortSignal.timeout(300000)])});
  if(!download.ok || !download.body)throw new Error(`下载失败 HTTP ${download.status}`);
  const chunks:Uint8Array[]=[];let total=0;
  for await(const chunk of download.body as unknown as AsyncIterable<Uint8Array>){signal.throwIfAborted();total+=chunk.length;if(total>asset.size)throw new Error('Update size mismatch');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==asset.size || `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`!==asset.digest)throw new Error('Agent 更新包摘要校验失败。');
  const zip=await JSZip.loadAsync(bytes);
  const rawManifest=zip.file('manifest.json');if(!rawManifest)throw new Error('Missing component manifest');
  const manifest=validateManifest(JSON.parse(await rawManifest.async('string')));
  if(`agent-v${manifest.version}`!==release.tag_name)throw new Error('Release/manifest version mismatch');
  const staging=path.join(root,'downloads',crypto.randomBytes(8).toString('hex'));
  await fs.mkdir(staging,{recursive:true});let inflated=0;
  for(const name of Object.keys(manifest.files)){
    signal.throwIfAborted();const file=zip.file(name);if(!file)throw new Error(`Missing ${name}`);
    const entry=file as typeof file & {unsafeOriginalName?:string};
    if(entry.unsafeOriginalName && entry.unsafeOriginalName!==name)throw new Error('Unsafe archive path');
    const target=safeBundlePath(staging,name);const data=await file.async('nodebuffer');
    inflated+=data.length;if(inflated>2*1024*1024*1024)throw new Error('Expanded component too large');
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data);
  }
  await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify(manifest));
  return staging;
}
