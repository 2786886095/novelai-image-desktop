import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {detectiveBudget, detectiveParameters, type DetectiveParameters, type DetectiveRecovery, type DetectiveRunRequest} from '../../src/artist-detective-contract';

const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
const fail = () => new Error('当前任务的原图、参数、账号、接口或运行环境已改变，不能安全恢复。');
function regular(file:string) {
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink() || !stat.isFile())throw fail();
  return stat;
}
/** Streaming digest: never read model weights or the entire reference into RAM. */
export function detectiveFileHash(file:string):string {
  regular(file);const fd=fs.openSync(file,'r'),hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024);
  try {let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}
  finally {fs.closeSync(fd);}
  return hash.digest('hex');
}
function json(file:string):any {
  if(regular(file).size>2*1024*1024)throw fail();
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function within(root:string,file:string) {
  const canonicalRoot=fs.realpathSync(root),resolved=path.resolve(file);
  const outside=(relative:string)=>!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative);
  let relative=path.relative(path.resolve(root),resolved),current=path.resolve(root);
  if(outside(relative)){relative=path.relative(canonicalRoot,resolved);current=canonicalRoot;}
  if(outside(relative))throw fail();
  for(const part of relative.split(path.sep)) {
    current=path.join(current,part);
    if(fs.lstatSync(current).isSymbolicLink())throw fail();
  }
  const actual=path.relative(canonicalRoot,fs.realpathSync(file));
  if(actual==='..'||actual.startsWith('..'+path.sep)||path.isAbsolute(actual))throw fail();
}
export function detectiveOwnedRun(userData:string,directory:string):string {
  const root=path.join(path.resolve(userData),'artist-detective-runs'),run=path.resolve(directory);
  if(path.dirname(run)!==root || !UUID.test(path.basename(run)) || fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory() || fs.lstatSync(run).isSymbolicLink() || !fs.statSync(run).isDirectory())throw fail();
  within(root,run);return run;
}
export type DetectiveBinding={python:string;assets:string;runner:string;variant:'full'|'light';imageBaseUrl:string;accountId?:string;token:string};
type FileIdentity={path:string;sha256:string};
function safeEndpoint(value:string,token?:string) {
  const u=new URL(value),local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&local))||(token&&value.includes(token)))throw fail();
}
export interface DetectiveRunManifest {
  schema:1;runId:string;createdAt:string;
  request:{prompt:string;style:string;budget:number;parameters:DetectiveParameters};
  reference:FileIdentity;
  runtime:{python:FileIdentity;assets:string;manifestSha256:string;filesIdentitySha256:string;variant:'full'|'light'};
  runner:FileIdentity;endpoint:string;accountId:string|null;credentialFingerprint:string;payloadIdentity:string;
}
function fileIdentity(file:string):FileIdentity {return {path:fs.realpathSync(file),sha256:detectiveFileHash(file)};}
function runtimeIdentity(binding:DetectiveBinding):DetectiveRunManifest['runtime'] {
  const assets=fs.realpathSync(binding.assets),file=path.join(assets,'manifest.json'),manifest=json(file);
  // The already-verified runtime retains its exact manifest, executable, and
  // complete manifest file stat signature. This is not a second GPU validation.
  const entries=Object.keys(manifest.files??{}).sort().map(name=>{
    const item=path.resolve(assets,name);within(assets,item);const stat=regular(item);
    return [name,stat.size,stat.mtimeMs,stat.ctimeMs];
  });
  return {python:fileIdentity(binding.python),assets,manifestSha256:detectiveFileHash(file),filesIdentitySha256:sha(JSON.stringify(entries)),variant:binding.variant};
}
export function createDetectiveRunManifest(directory:string,value:DetectiveRunRequest,binding:DetectiveBinding) {
  safeEndpoint(binding.imageBaseUrl,binding.token);
  const request={prompt:value.prompt.trim(),style:value.style.trim(),budget:detectiveBudget(value.budget),parameters:detectiveParameters(value.parameters)};
  regular(value.image);
  const reference=path.join(directory,'reference'+(/\.(png|jpe?g|webp)$/i.exec(value.image)?.[0].toLowerCase()??'.image'));
  fs.copyFileSync(value.image,reference,fs.constants.COPYFILE_EXCL);
  const manifest:DetectiveRunManifest={schema:1,runId:path.basename(directory),createdAt:new Date().toISOString(),request,reference:fileIdentity(reference),runtime:runtimeIdentity(binding),runner:fileIdentity(binding.runner),endpoint:binding.imageBaseUrl,accountId:binding.accountId??null,credentialFingerprint:sha('artist-detective-resume\0'+binding.token),payloadIdentity:sha(JSON.stringify(request))};
  const text=JSON.stringify(manifest,null,2);fs.writeFileSync(path.join(directory,'run-manifest.json'),text,{flag:'wx'});
  return {manifest,manifestSha256:sha(text)};
}
export function readDetectiveRunManifest(directory:string,expected:string):DetectiveRunManifest {
  if(!HEX.test(expected))throw fail();const file=path.join(directory,'run-manifest.json');within(directory,file);
  if(detectiveFileHash(file)!==expected)throw fail();const m=json(file) as DetectiveRunManifest;
  if(m.schema!==1 || m.runId!==path.basename(directory) || !m.reference?.path || !HEX.test(m.reference.sha256) || !m.runner?.path || !m.runtime?.python?.path || !m.runtime.assets || !['full','light'].includes(m.runtime.variant) || !HEX.test(m.credentialFingerprint) || !m.request || typeof m.request.prompt!=='string' || typeof m.request.style!=='string' || !m.request.prompt.trim() || m.request.prompt.length>16000 || m.request.style.length>8000)throw fail();
  detectiveBudget(m.request.budget);const parameters=detectiveParameters(m.request.parameters);
  safeEndpoint(m.endpoint);
  if(JSON.stringify(parameters)!==JSON.stringify(m.request.parameters) || sha(JSON.stringify(m.request))!==m.payloadIdentity)throw fail();
  within(directory,m.reference.path);return m;
}
export function verifyDetectiveRunBinding(m:DetectiveRunManifest,binding:DetectiveBinding) {
  if(m.endpoint!==binding.imageBaseUrl || m.accountId!==(binding.accountId??null) || m.credentialFingerprint!==sha('artist-detective-resume\0'+binding.token) || JSON.stringify(m.runtime)!==JSON.stringify(runtimeIdentity(binding)) || JSON.stringify(m.runner)!==JSON.stringify(fileIdentity(binding.runner)) || detectiveFileHash(m.reference.path)!==m.reference.sha256)throw fail();
}
/** Reads only bounded owned metadata. No account, token, paths or model loading
 * is exposed to the renderer by the recovery summary. */
export function detectiveRecovery(directory:string,manifestSha256?:string):DetectiveRecovery {
  if(!manifestSha256)return {supported:false,message:'旧任务缺少原账号与接口绑定，无法安全恢复；图片仍保留。'};
  try {
    readDetectiveRunManifest(directory,manifestSha256);
    let status:any={};
    if(fs.existsSync(path.join(directory,'status.json')))status=json(path.join(directory,'status.json'));
    if(status.stage==='complete')return {supported:false,message:'此任务已完成；结果仍保留。'};
    // A marker with no verified result is always uncertain unless the durable
    // transport record proves pre-connect/429. Never trust a renderer boolean.
    const pending=detectivePendingRequests(directory);
    if(pending.length>1)throw fail();
    // Progress/failure replacement may fail or lag behind the spool. Only the
    // actual unresolved marker may select a receipt or a paid replay identity.
    const pendingRequestHash=pending[0];
    let safelyRejected=false;
    if(pending.length===1 && pendingRequestHash) {
      const diagnostic=path.join(directory,'spool/transport-errors',pendingRequestHash+'.json');
      if(fs.existsSync(diagnostic)) {
        within(directory,diagnostic);const saved=json(diagnostic);
        const matches=saved.request_hash===pendingRequestHash && saved.pendingRequestHash===pendingRequestHash && saved.requiresPaidReplayConfirmation===false;
        safelyRejected=matches && ((saved.status==='connect' && saved.reason==='connect') || (saved.status===429 && saved.reason==='rate_limited'));
      }
    }
    return {supported:true,manifestSha256,pendingRequestHash,requiresPaidReplayConfirmation:pending.length===1 && !safelyRejected};
  }catch{return {supported:false,message:'当前任务的恢复记录不完整或已变化；图片仍保留，未自动重发。'};}
}
export function detectivePendingRequests(directory:string):string[] {
  const requests=path.join(directory,'spool/requests');if(!fs.existsSync(requests))return [];
  within(directory,requests);const completed=detectiveVerifiedResults(directory,false).hashes;
  const pending:string[]=[];
  for(const entry of fs.readdirSync(requests)) {
    const match=/^([a-f0-9]{64})\.json$/.exec(entry);if(!match)continue;
    const file=path.join(requests,entry);within(directory,file);const record=json(file);
    if(record.request_hash!==match[1])throw fail();if(!completed.has(match[1]))pending.push(match[1]);
  }
  return pending;
}
/** Verify persisted cached bytes before deriving the remaining logical budget. */
export function detectiveVerifiedResults(directory:string,verifyBytes=true):{count:number;hashes:Set<string>} {
  const root=path.join(directory,'spool/results'),hashes=new Set<string>();if(!fs.existsSync(root))return {count:0,hashes};within(directory,root);
  for(const folder of fs.readdirSync(root,{withFileTypes:true})) {
    const branch=path.join(root,folder.name);within(directory,branch);if(!folder.isDirectory())throw fail();
    for(const name of fs.readdirSync(branch)) {
      if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
      const file=path.join(branch,name);within(directory,file);const row=json(file),key=name.slice(0,-5);
      if(row.request_hash!==key || !HEX.test(row.image_sha256??'') || typeof row.image!=='string' || hashes.has(key))throw fail();
      within(directory,row.image);const expectedImage=path.join(branch,key+'.png');within(directory,expectedImage);if(fs.realpathSync(row.image)!==fs.realpathSync(expectedImage))throw fail();regular(row.image);
      if(verifyBytes && detectiveFileHash(row.image)!==row.image_sha256)throw fail();hashes.add(key);
    }
  }
  return {count:hashes.size,hashes};
}
/** Preserve old failure/stop evidence instead of deleting it on a resume. */
export function archiveDetectivePause(directory:string,attemptId:string) {
  const history=path.join(directory,'resume-history');
  if(fs.existsSync(history)){within(directory,history);if(!fs.statSync(history).isDirectory())throw fail();}else fs.mkdirSync(history);
  for(const name of ['STOP','failure.json']) {
    const file=path.join(directory,name);if(!fs.existsSync(file))continue;within(directory,file);regular(file);
    fs.renameSync(file,path.join(history,`${attemptId}-${name}`));
  }
}
