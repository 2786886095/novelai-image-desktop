import {planPluginUpgrades,stagePluginPackages,type PluginChange} from './harness-plugin-update';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {updateFetch} from './download-request';
import {safeBundlePath,validateManifest,verifyBundle,installVerifiedBundle} from './harness-policy';
import {componentDownloadDeadline} from './harness-update';

const registry='https://registry.npmjs.org';
const npmVersion='10.9.4';
const versionPattern=/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
type PackageMeta={name:string;version:string;dist:{tarball:string;integrity:string};[key:string]:unknown};
export interface OfficialRuntimeDownload {
 version:string;bytes:number;package:PackageMeta;installer:PackageMeta;
 activeStamp:string;manifestHash:string;kind:'official-runtime';pluginUpdates:PluginChange[];
}
const sha=(data:Buffer|string)=>crypto.createHash('sha256').update(data).digest('hex');
/** Rebind only the shipped exact-version declarations in a new candidate.
 * This does not approve it: Engine must still boot the full retained plugin
 * graph in isolation. User-edited plugins are never rewritten here. */
export async function stageOfficialCommunity(target:string,files:Record<string,string>,version:string){
 if(!versionPattern.test(version))throw Error('Invalid candidate version');
 const relative='community/manifest.json';if(!files[relative])return;
 const file=safeBundlePath(target,relative),before=await fs.readFile(file);
 if(sha(before)!==files[relative])throw Error('Community candidate changed');
 const meta=JSON.parse(before.toString('utf8'));
 const catalog='community/packages/dsh-roleplay-rp-feature-manager/src/catalog.js';
 if(files[catalog]){
  const filename=safeBundlePath(target,catalog),data=await fs.readFile(filename);
  if(sha(data)!==files[catalog])throw Error('Roleplay candidate changed');
  const previous=`SUPPORTED_DSH_RANGE = '${meta.harnessServices}'`,source=data.toString('utf8');
  if(source.split(previous).length!==2)throw Error('Roleplay 版本声明结构变化，候选更新未安装。');
  const replacement=source.replace(previous,`SUPPORTED_DSH_RANGE = '${version}'`);
  await fs.writeFile(filename,replacement);files[catalog]=sha(replacement);
 }
 const updated=JSON.stringify({...meta,harnessServices:version});await fs.writeFile(file,updated);files[relative]=sha(updated);
}
export function registryUrl(value:string){
 const url=new URL(value);
 if(url.origin!==registry||url.username||url.password||url.hash)throw Error('官方更新源地址无效。');
 return url.href;
}
export function verifyArchive(bytes:Buffer,integrity:string){
 const match=/^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
 if(!match||crypto.createHash('sha512').update(bytes).digest('base64')!==match[1])throw Error('官方更新包完整性校验失败。');
}
async function metadata(name:string,version:string,signal:AbortSignal):Promise<PackageMeta>{
 if(!versionPattern.test(version))throw Error('官方版本号无效。');
 const response=await updateFetch(`${registry}/${encodeURIComponent(name)}/${version}`,{signal});
 if(!response.ok)throw Error(`官方版本查询 HTTP ${response.status}`);
 const meta=await response.json() as PackageMeta;
 if(meta.name!==name||meta.version!==version||!/^sha512-[A-Za-z0-9+/]+=*$/.test(meta.dist?.integrity??''))throw Error('官方包元数据无效。');
 registryUrl(meta.dist.tarball);return meta;
}
async function activeBundle(root:string){
 const activeStamp=await fs.readFile(path.join(root,'active.json'),'utf8');
 const active=JSON.parse(activeStamp);
 if(typeof active.slot!=='string'||!/^[a-zA-Z0-9.-]+$/.test(active.slot))throw Error('当前组件目录无效。');
 const source=path.join(root,'versions',active.slot),raw=await fs.readFile(path.join(source,'manifest.json'),'utf8');
 return {source,activeStamp,manifestHash:sha(raw),manifest:validateManifest(JSON.parse(raw))};
}
/** Metadata only; confirmation is bound to the exact upstream and installer SRI. */
export async function planOfficialRuntime(root:string,version:string,signal:AbortSignal):Promise<OfficialRuntimeDownload>{
 const [active,pkg,installer]=await Promise.all([activeBundle(root),metadata('@deepseek-ai/dsh',version,signal),metadata('npm',npmVersion,signal)]);
 const pluginUpdates=await planPluginUpgrades(root,version,signal);
 return {kind:'official-runtime',version,bytes:0,package:pkg,installer,activeStamp:active.activeStamp,manifestHash:active.manifestHash,pluginUpdates};
}

/** Bootstrap npm has a plain package/ tar layout. Reject links and extended paths. */
export async function unpackNpm(bytes:Buffer,root:string,signal:AbortSignal){
 const tar=gunzipSync(bytes,{maxOutputLength:128*1024*1024});let offset=0,count=0;
 while(offset+512<=tar.length){
  signal.throwIfAborted();const header=tar.subarray(offset,offset+512);if(header.every(b=>b===0))break;
  const field=(a:number,b:number)=>header.subarray(a,b).toString('utf8').replace(/\0.*$/s,'');
  const checksum=parseInt(field(148,156).trim(),8);let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];if(checksum!==sum)throw Error('Invalid npm archive header');
  const prefix=field(345,500),name=(prefix?prefix+'/':'')+field(0,100),size=parseInt(field(124,136).trim()||'0',8),type=field(156,157);
  if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length||++count>20000)throw Error('Invalid npm archive length');
  if(!name.startsWith('package/'))throw Error('Invalid npm archive prefix');
  const relative=name.slice(8).replace(/\/$/,'');
  if(relative){const file=safeBundlePath(root,relative);
   if(type==='5')await fs.mkdir(file,{recursive:true});
   else if(type===''||type==='0'){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,tar.subarray(offset+512,offset+512+size),{flag:'wx'});}
   else throw Error('Unsupported npm archive entry');
  }
  offset+=512+Math.ceil(size/512)*512;
 }
 if(!count)throw Error('Empty npm archive');
}

/** npm only talks to this nonce-scoped loopback registry. All upstream GETs go
 * through Studio's update proxy, including dependency tarballs. No user npmrc. */
export async function startOfficialRegistry(signal:AbortSignal,log:(s:string)=>void,pinned:PackageMeta|PackageMeta[],progress:()=>void=()=>{}){
 const nonce=crypto.randomBytes(24).toString('hex');let base='',received=0;const pending=new Set<Promise<void>>();
 const server=createServer((req,res)=>{
  const task=(async()=>{
   try{
    if(req.method!=='GET'||!req.url?.startsWith('/'+nonce+'/')){res.writeHead(403).end();return;}
    const incoming=new URL(req.url,'http://127.0.0.1');let remote:string;
    const route=incoming.pathname.slice(nonce.length+2);
    if(route==='asset'){remote=registryUrl(incoming.searchParams.get('url')??'');}
    else{remote=registryUrl(registry+'/'+route+incoming.search);if(route.includes('..'))throw Error('Invalid registry route');}
    const response=await updateFetch(remote,{signal,headers:{Accept:'application/json'}});
    if(!response.ok){await response.body?.cancel();res.writeHead(response.status).end();return;}
    const rewrite=(value:unknown):unknown=>{
     if(Array.isArray(value))return value.map(rewrite);
     if(value&&typeof value==='object'){
      const record=value as Record<string,unknown>;
      for(const pin of Array.isArray(pinned)?pinned:[pinned])if(record.name===pin.name&&record.version===pin.version&&record.dist){const d=record.dist as Record<string,unknown>;if(d.integrity!==pin.dist.integrity||d.tarball!==pin.dist.tarball)throw Error('官方包在确认后发生变化，请重新检查。');}
      const result:Record<string,unknown>={};for(const [key,v]of Object.entries(record))result[key]=key==='tarball'&&typeof v==='string'?base+'asset?url='+encodeURIComponent(registryUrl(v)):rewrite(v);return result;
     }return value;
    };
    if(route==='asset'){
     log('下载官方依赖：'+new URL(remote).pathname.split('/').at(-1));res.setHeader('Content-Type','application/octet-stream');
     if(response.body)for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){signal.throwIfAborted();received+=part.length;if(received>2*1024**3)throw Error('官方更新超过下载体积限制。');progress();if(!res.write(part))await new Promise<void>((resolve,reject)=>{const done=()=>{res.off('close',closed);resolve();};const closed=()=>{res.off('drain',done);reject(Error('Registry client closed'));};res.once('drain',done);res.once('close',closed);});}
     res.end();
    }else{const body=rewrite(await response.json());progress();res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));}
   }catch(error){if(!res.headersSent)res.writeHead(502);res.end();if(!signal.aborted)log('官方依赖请求失败：'+(error instanceof Error?error.message:'网络错误'));}
  })();pending.add(task);void task.finally(()=>pending.delete(task));
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
 const address=server.address();if(!address||typeof address==='string')throw Error('Registry listen failed');base=`http://127.0.0.1:${address.port}/${nonce}/`;
 const abort=()=>server.closeAllConnections();signal.addEventListener('abort',abort,{once:true});
 return {url:base,close:async()=>{signal.removeEventListener('abort',abort);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await Promise.allSettled([...pending]);}};
}

async function runInstaller(node:string,cli:string,directory:string,registryUrl:string,signal:AbortSignal,log:(s:string)=>void){
 const config=path.join(directory,'empty.npmrc'),globalConfig=path.join(directory,'global.npmrc');await fs.writeFile(config,'');await fs.writeFile(globalConfig,'');
 const env:NodeJS.ProcessEnv={};for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{HOME:directory,USERPROFILE:directory,APPDATA:directory,LOCALAPPDATA:directory,NO_PROXY:'127.0.0.1,localhost',npm_config_userconfig:config,npm_config_globalconfig:globalConfig});
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(node,[cli,'install','--ignore-scripts','--omit=dev','--no-audit','--no-fund','--bin-links=false','--registry='+registryUrl,'--cache='+path.join(directory,'npm-cache'),'--fetch-retries=1','--fetch-timeout=120000'],{cwd:directory,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',b=>{output=(output+b.toString()).slice(-5000);});child.stderr.on('data',b=>{output=(output+b.toString()).slice(-5000);});
  const abort=()=>{if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>child.kill());else child.kill('SIGKILL');};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  child.once('error',error=>{signal.removeEventListener('abort',abort);reject(error);});
  child.once('close',code=>{signal.removeEventListener('abort',abort);if(signal.aborted)reject(signal.reason);else if(code!==0)reject(Error('官方依赖安装失败：'+output.replaceAll(registryUrl,'[更新代理]/')));else{log('官方运行环境依赖下载完成。');resolve();}});
 });
}

/** Builds a fresh candidate, never mutates the active slot or user-home. */
export async function downloadOfficialRuntime(root:string,approved:OfficialRuntimeDownload,signal:AbortSignal,log:(s:string)=>void){
 const active=await activeBundle(root);
 if(active.activeStamp!==approved.activeStamp||active.manifestHash!==approved.manifestHash)throw Error('当前组件在确认后发生变化，请重新检查。');
 const deadline=componentDownloadDeadline(signal,180000,3600000);signal=deadline.signal;
 const id=crypto.randomBytes(8).toString('hex'),target=path.join(root,'downloads',id),work=path.join(root,'official-staging',id);
 await fs.mkdir(work,{recursive:true});await fs.mkdir(target,{recursive:true});
 let gateway:Awaited<ReturnType<typeof startOfficialRegistry>>|undefined;
 try{
  log(`下载 Harness 官方 ${approved.version}；Studio 组件保持 ${active.manifest.version}。`);
  const response=await updateFetch(registryUrl(approved.installer.dist.tarball),{signal});if(!response.ok)throw Error(`官方安装器下载 HTTP ${response.status}`);
  const parts:Uint8Array[]=[];let bytes=0;if(response.body)for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){bytes+=part.length;if(bytes>32*1024*1024)throw Error('官方安装器体积异常');parts.push(part);deadline.progress();}
  const archive=Buffer.concat(parts);verifyArchive(archive,approved.installer.dist.integrity);const npm=path.join(work,'npm');await unpackNpm(archive,npm,signal);
  log('正在校验现有组件；仅复制到隔离候选目录。');
  await verifyBundle(active.source,active.manifest,signal);deadline.progress();
  const retained={...active.manifest,files:Object.fromEntries(Object.entries(active.manifest.files).filter(([name])=>!name.startsWith('runtime/')&&!name.startsWith('plugin-updates/')))};
  await installVerifiedBundle(active.source,target,retained,signal,()=>deadline.progress());
  const runtime=path.join(target,'runtime');await fs.mkdir(runtime,{recursive:true});
  const changes=approved.pluginUpdates??[];
  const dependencies:Record<string,string>={'@deepseek-ai/dsh':approved.version};
  for(const change of changes)if(change.action==='upgrade'){dependencies[change.name]=change.version!;for(const peer of Object.keys(change.meta?.peerDependencies??{}))if(peer.startsWith('@deepseek-ai/dsh-'))dependencies[peer]=approved.version;}
  await fs.writeFile(path.join(runtime,'package.json'),JSON.stringify({private:true,dependencies}));
  gateway=await startOfficialRegistry(signal,log,[approved.package,...changes.filter(c=>c.action==='upgrade').map(c=>c.meta!)],deadline.progress);
  log('正在通过软件更新代理获取官方运行环境依赖…');
  await runInstaller(path.join(target,active.manifest.node),path.join(npm,'bin/npm-cli.js'),runtime,gateway.url,signal,log);
  const installed=JSON.parse(await fs.readFile(path.join(runtime,'node_modules/@deepseek-ai/dsh/package.json'),'utf8'));
  if(installed.version!==approved.version||installed.name!=='@deepseek-ai/dsh')throw Error('官方运行环境版本不符。');
  const files:Record<string,string>={...retained.files};
  await stageOfficialCommunity(target,files,approved.version);
  await stagePluginPackages(runtime,target,changes,files,signal);
  async function collect(dir:string,relative:string){for(const name of await fs.readdir(dir)){signal.throwIfAborted();const full=path.join(dir,name),stat=await fs.lstat(full),rel=relative+'/'+name;
   if(stat.isSymbolicLink())throw Error('官方运行环境包含未验证链接。');
   if(stat.isDirectory())await collect(full,rel);else if(stat.isFile()){files[rel]=sha(await fs.readFile(full));deadline.progress();}
  }}
  await collect(path.join(runtime,'node_modules'),'runtime/node_modules');
  log('官方候选文件校验完成，接下来检查实际插件启动兼容性。');
  const manifest=validateManifest({...active.manifest,upstream:approved.version,files,pluginChanges:changes.map(({meta,...change})=>change)});
  const raw=JSON.stringify(manifest);await fs.writeFile(path.join(target,'manifest.json'),raw);
  await fs.writeFile(path.join(target,'.studio-download.json'),JSON.stringify({manifestSha256:sha(raw),official:approved.version,integrity:approved.package.dist.integrity}));
  signal.throwIfAborted();return target;
 }finally{deadline.dispose();await gateway?.close();}
}
/** Build a plugin-only candidate while retaining the installed Node and Harness files. */
export async function downloadPluginUpdates(root:string,changes:PluginChange[],parent:AbortSignal,log:(s:string)=>void){
 if(!changes.length||changes.some(c=>c.action!=='upgrade'||!c.meta||c.meta.name!==c.name||c.meta.version!==c.version))throw Error('插件更新计划无效');
 const active=await activeBundle(root);
 const deadline=componentDownloadDeadline(parent,180000,3600000),signal=deadline.signal;
 const id=crypto.randomBytes(8).toString('hex'),target=path.join(root,'downloads',id),work=path.join(root,'plugin-downloads',id);
 let gateway:Awaited<ReturnType<typeof startOfficialRegistry>>|undefined;
 try{
  await fs.mkdir(target,{recursive:true});await fs.mkdir(work,{recursive:true});
  const installer=await metadata('npm',npmVersion,signal);
  const response=await updateFetch(registryUrl(installer.dist.tarball),{signal});if(!response.ok)throw Error(`插件安装器下载 HTTP ${response.status}`);
  const chunks:Uint8Array[]=[];let length=0;
  if(response.body)for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){signal.throwIfAborted();length+=part.length;if(length>32*1024*1024)throw Error('插件安装器体积异常');chunks.push(part);deadline.progress();}
  const bytes=Buffer.concat(chunks);verifyArchive(bytes,installer.dist.integrity);
  const npm=path.join(work,'npm');await unpackNpm(bytes,npm,signal);
  const retained={...active.manifest,files:Object.fromEntries(Object.entries(active.manifest.files).filter(([name])=>!name.startsWith('plugin-updates/')))};
  log('保留当前 Harness；只下载兼容插件及其依赖。');
  await installVerifiedBundle(active.source,target,retained,signal,()=>deadline.progress());
  const runtime=path.join(work,'packages');await fs.mkdir(runtime);
  const dependencies:Record<string,string>={};
  for(const c of changes){dependencies[c.name]=c.version!;for(const name of Object.keys(c.meta?.peerDependencies??{}))if(name.startsWith('@deepseek-ai/dsh-'))dependencies[name]=active.manifest.upstream;}
  await fs.writeFile(path.join(runtime,'package.json'),JSON.stringify({private:true,dependencies}));
  gateway=await startOfficialRegistry(signal,log,changes.map(c=>c.meta!),deadline.progress);
  await runInstaller(path.join(target,active.manifest.node),path.join(npm,'bin/npm-cli.js'),runtime,gateway.url,signal,log);
  const files={...retained.files};await stagePluginPackages(runtime,target,changes,files,signal);
  const current=await activeBundle(root);
  if(current.activeStamp!==active.activeStamp||current.manifestHash!==active.manifestHash)throw Error('下载期间组件已变化，请重新检查。');
  const manifest=validateManifest({...retained,files,pluginChanges:changes.map(({meta,...change})=>change)});
  const raw=JSON.stringify(manifest);await fs.writeFile(path.join(target,'manifest.json'),raw);
  await fs.writeFile(path.join(target,'.studio-download.json'),JSON.stringify({manifestSha256:sha(raw),plugins:true}));
  signal.throwIfAborted();return target;
 }finally{deadline.dispose();await gateway?.close();}
}
