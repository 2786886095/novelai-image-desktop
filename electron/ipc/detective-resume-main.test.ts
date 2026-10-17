import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const fixture = vi.hoisted(() => ({root:'', token:'FIXTURE_HIGH_ENTROPY_TOKEN_1234567890', endpoint:'https://fixture.invalid', account:'fixture-account', proxy:'direct', launch:vi.fn(), confirm:vi.fn(), bridges:[] as any[]}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root,getAppPath:()=>fixture.root},dialog:{showMessageBox:fixture.confirm},shell:{}}));
vi.mock('node:child_process',()=>({spawn:(...args:unknown[])=>fixture.launch(...args)}));
vi.mock('./store',()=>({getToken:()=>fixture.token,getSetting:()=> 'zh-CN',getSettings:()=>({naiAccountId:fixture.account,imageBaseUrl:fixture.endpoint,proxyMode:fixture.proxy}),atomicWriteFileSync:(p:string,s:string)=>fs.writeFileSync(p,s)}));
vi.mock('./nai',()=>({resolveNovelAiGenerationBaseUrl:()=>fixture.endpoint}));
vi.mock('./local-media-protocol',()=>({toLocalMediaUrl:(p:string)=>p}));
vi.mock('./detective-download',()=>({detectiveDownloadStatus:()=>({busy:false}),detectiveDownloadVariant:vi.fn()}));
vi.mock('./portable-projects',()=>({assertPortableIdle:()=>{},registerPortableBusy:()=>{}}));
vi.mock('./detective-runtime-check',()=>({detectiveRuntimeChecking:()=>false,detectiveRuntimeValidation:()=>({state:'passed'}),validateDetectiveRuntime:vi.fn()}));
vi.mock('./detective-generation-bridge',()=>({startDetectiveGenerationBridge:async(binding:unknown)=>{const close=vi.fn(async()=>{});fixture.bridges.push({...binding as any,close});return {connection:{url:'http://127.0.0.1:12345/generate',key:'b'.repeat(64)},close};}}));
import * as service from './artist-detective';
type Worker = EventEmitter & {stdin:PassThrough;kill:ReturnType<typeof vi.fn>;pid:undefined};
let workers:Worker[]=[];
const resume = (request:unknown) => (service as unknown as {detectiveResume:(r:unknown)=>Promise<any>}).detectiveResume(request);
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const key='f'.repeat(64);
const request=()=>({image:path.join(fixture.root,'reference.png'),prompt:'1girl, standing',style:'cel shading',budget:300});
const config=()=>JSON.parse(fs.readFileSync(path.join(fixture.root,'artist-detective-runtime.json'),'utf8'));
const recovery=(directory:string)=>({directory,manifestSha256:(service.detectiveStatus() as any).recovery?.manifestSha256,pendingRequestHash:key});
function pause(directory:string,reason='uncertain',completed=0){
 fs.mkdirSync(path.join(directory,'spool/requests'),{recursive:true});
 fs.writeFileSync(path.join(directory,'spool/requests',`${key}.json`),JSON.stringify({request_hash:key}));
 const event={stage:'paused',completed,budget:300,paused:true,resumable:true,pendingRequestHash:key,reason,safeCode:'reset',requiresPaidReplayConfirmation:reason==='uncertain'};
 fs.mkdirSync(path.join(directory,'spool/transport-errors'),{recursive:true});fs.writeFileSync(path.join(directory,'spool/transport-errors',`${key}.json`),JSON.stringify({...event,request_hash:key,status:reason==='connect'?'connect':reason==='rate_limited'?429:'uncertain'}));
 fs.writeFileSync(path.join(directory,'status.json'),JSON.stringify(event));fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({...event,message:'fixture pause'}));
 workers.at(-1)!.emit('close',1);
}
function cached(directory:string,count:number){
 for(let i=0;i<count;i++){
  const hash=sha(`request-${i}`),folder=path.join(directory,'spool/results/native');fs.mkdirSync(folder,{recursive:true});
  const image=path.join(folder,`${hash}.png`),bytes=Buffer.from(`FIXTURE_${i}`);fs.writeFileSync(image,bytes);
  fs.writeFileSync(path.join(folder,`${hash}.json`),JSON.stringify({request_hash:hash,image,image_sha256:sha(bytes)}));
 }
}
beforeEach(()=>{
 fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-resume-main-'));fixture.endpoint='https://fixture.invalid';fixture.account='fixture-account';fixture.token='FIXTURE_HIGH_ENTROPY_TOKEN_1234567890';fixture.proxy='direct';fixture.bridges.length=0;workers=[];
 fs.mkdirSync(path.join(fixture.root,'assets'));fs.writeFileSync(path.join(fixture.root,'assets/manifest.json'),'{}');fs.writeFileSync(path.join(fixture.root,'python.exe'),'fixture python');fs.writeFileSync(path.join(fixture.root,'reference.png'),'fixture reference');fs.mkdirSync(path.join(fixture.root,'scripts'));fs.writeFileSync(path.join(fixture.root,'scripts/artist-detective-live.py'),'fixture runner');
 fs.writeFileSync(path.join(fixture.root,'artist-detective-runtime.json'),JSON.stringify({python:path.join(fixture.root,'python.exe'),assets:path.join(fixture.root,'assets')}));
 fixture.confirm.mockReset().mockResolvedValue({response:1});fixture.launch.mockReset().mockImplementation(()=>{const w=Object.assign(new EventEmitter(),{stdin:new PassThrough(),kill:vi.fn(),pid:undefined});workers.push(w);return w;});
});
afterEach(()=>{vi.restoreAllMocks();for(const w of workers)w.emit('close',0);fs.rmSync(fixture.root,{recursive:true,force:true});});
describe('manual same-run recovery with frozen identity',()=>{
 it('creates an immutable secret-free manifest and an exact owned reference copy',async()=>{
  const s=await service.detectiveStart(request());const file=path.join(s.directory!,'run-manifest.json');expect(fs.existsSync(file)).toBe(true);
  const text=fs.readFileSync(file,'utf8'),m=JSON.parse(text);expect(text).not.toContain(fixture.token);expect(m.request.prompt).toBe(request().prompt);expect(m.request.budget).toBe(300);
  expect(m.reference.path).not.toBe(request().image);expect(fs.readFileSync(m.reference.path)).toEqual(fs.readFileSync(request().image));expect(config().runManifestSha256).toBe(sha(text));
 });
 it('resumes the same 137/300 run using remaining logical budget and preserved cached/search bytes',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;cached(dir,137);fs.mkdirSync(path.join(dir,'search'));const round=path.join(dir,'search/round-00.json');fs.writeFileSync(round,'{"results":[]}');pause(dir,'connect',137);fs.writeFileSync(path.join(dir,'STOP'),'stop');
  const old=fs.readFileSync(round),r=await resume(recovery(dir));expect(r.directory).toBe(dir);expect(r.completed).toBe(137);expect(fs.readFileSync(round)).toEqual(old);expect(fixture.confirm).not.toHaveBeenCalled();
  const body=JSON.parse(workers[1].stdin.read().toString());expect(body.resume).toBe(true);expect(body.budget).toBe(300);expect(body.output).toBe(dir);expect(body.prompt).toBe(request().prompt);expect(fixture.bridges[1].budget).toBe(163);expect(fs.readdirSync(path.dirname(dir))).toHaveLength(1);
 });
 it('requires native confirmation for exactly the unresolved paid request; cancellation leaves every artifact',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);const before=fs.readFileSync(path.join(dir,'failure.json'));fixture.confirm.mockResolvedValue({response:0});
  await expect(resume(recovery(dir))).rejects.toThrow(/取消/);expect(workers).toHaveLength(1);expect(fs.readFileSync(path.join(dir,'failure.json'))).toEqual(before);
  const options=fixture.confirm.mock.calls[0][0];expect(options.message).toContain('可能已扣费');expect(options.detail).toContain(key);expect(options.defaultId).toBe(0);expect(options.cancelId).toBe(0);
 });
 it('issues a new single-request consent only after native confirmation, and uses the current proxy',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);fixture.proxy='auto';await resume(recovery(dir));const body=JSON.parse(workers[1].stdin.read().toString());
  expect(body.resumeAuthorization).toMatchObject({requestHash:key,allowUncertainReplay:true});expect(body.resumeAuthorization.consentId).toMatch(/^[a-f0-9-]{36}$/);expect((fixture.bridges[1] as any).settings.proxyMode).toBe('auto');expect(body.budget).toBe(300);
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'resume-history',body.resumeAuthorization.consentId+'-authorization.json'),'utf8'));expect(receipt).toMatchObject({kind:'native-paid-replay-consent',requestHash:key,possibleExtraPaidAttempt:1,submissionNotObservedHere:true});expect(JSON.stringify(receipt)).not.toContain(fixture.token);
 });
 it.each(['account','token','endpoint','runner','reference','manifest','runtime'])('rejects changed %s before starting or confirming a paid request',async(kind)=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);const req=recovery(dir),m=JSON.parse(fs.readFileSync(path.join(dir,'run-manifest.json'),'utf8'));
  if(kind==='account')fixture.account='other';if(kind==='token')fixture.token='OTHER_HIGH_ENTROPY_FIXTURE_TOKEN_1234';if(kind==='endpoint')fixture.endpoint='https://other.invalid';if(kind==='runner')fs.appendFileSync(path.join(fixture.root,'scripts/artist-detective-live.py'),' changed');if(kind==='reference')fs.appendFileSync(m.reference.path,' changed');if(kind==='manifest')fs.appendFileSync(path.join(dir,'run-manifest.json'),' ');if(kind==='runtime')fs.appendFileSync(path.join(fixture.root,'python.exe'),' changed');
  await expect(resume(req)).rejects.toThrow();expect(workers).toHaveLength(1);expect(fixture.confirm).not.toHaveBeenCalled();
 });
 it('rechecks the frozen binding after native dialog and does not race another worker',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);fixture.confirm.mockImplementation(async()=>{fixture.account='changed-during-dialog';return {response:1};});await expect(resume(recovery(dir))).rejects.toThrow();expect(workers).toHaveLength(1);
 });
 it('rejects stale pending identity and never grants an arbitrary renderer replay boolean',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);await expect(resume({...recovery(dir),pendingRequestHash:'a'.repeat(64),confirmUncertainReplay:true})).rejects.toThrow();expect(workers).toHaveLength(1);expect(fixture.confirm).not.toHaveBeenCalled();
 });
 it('does not invent a frozen identity for a legacy run',async()=>{
  const dir=path.join(fixture.root,'artist-detective-runs','00000000-0000-4000-8000-000000000001');fs.mkdirSync(dir,{recursive:true});const c=config();fs.writeFileSync(path.join(fixture.root,'artist-detective-runtime.json'),JSON.stringify({...c,directory:dir}));
  expect((service.detectiveStatus() as any).recovery?.supported).toBe(false);await expect(resume({directory:dir,manifestSha256:'a'.repeat(64)})).rejects.toThrow();expect(workers).toHaveLength(0);expect(fs.existsSync(path.join(dir,'run-manifest.json'))).toBe(false);
 });
 it('rejects a corrupt cached image before allocating a bridge or touching old failure evidence',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;cached(dir,1);pause(dir,'connect',1);const png=path.join(dir,'spool/results/native',sha('request-0')+'.png');fs.appendFileSync(png,'corrupt');const old=fs.readFileSync(path.join(dir,'failure.json'));await expect(resume(recovery(dir))).rejects.toThrow();expect(workers).toHaveLength(1);expect(fixture.bridges).toHaveLength(1);expect(fs.readFileSync(path.join(dir,'failure.json'))).toEqual(old);
 });
 it('does not accept new prompt/parameters from a renderer resume request',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir,'connect');await resume({...recovery(dir),prompt:'changed draft',budget:600,parameters:{steps:1}});const body=JSON.parse(workers[1].stdin.read().toString());expect(body.prompt).toBe(request().prompt);expect(body.budget).toBe(300);expect(body.parameters.steps).toBe(28);
 });
 it('does not launch another worker during the native confirmation interval',async()=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir);fixture.confirm.mockImplementation(async()=>{await expect(service.detectiveStart(request())).rejects.toThrow(/正在运行/);return {response:0};});await expect(resume(recovery(dir))).rejects.toThrow(/取消/);expect(workers).toHaveLength(1);
 });
 it.each(['status','reason','request_hash','pendingRequestHash','requiresPaidReplayConfirmation'])('treats a connect receipt missing %s as uncertain and asks for native consent',async(field)=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir,'connect');const file=path.join(dir,'spool/transport-errors',key+'.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));delete saved[field];fs.writeFileSync(file,JSON.stringify(saved));expect((service.detectiveStatus() as any).recovery.requiresPaidReplayConfirmation).toBe(true);fixture.confirm.mockResolvedValue({response:0});await expect(resume(recovery(dir))).rejects.toThrow(/取消/);expect(fixture.confirm).toHaveBeenCalledTimes(1);expect(workers).toHaveLength(1);
 });
 it.each(['archive','authorization','log','spawn'])('closes a newly created bridge if %s preparation fails before a worker can own it',async(kind)=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir,kind==='authorization'?'uncertain':'connect');
  if(kind==='archive')fs.writeFileSync(path.join(dir,'resume-history'),'not a directory');
  if(kind==='authorization'){const original=fs.writeFileSync;vi.spyOn(fs,'writeFileSync').mockImplementation(((file:any,...args:any[])=>{if(String(file).endsWith('-authorization.json'))throw Error('fixture authorization write failure');return (original as any)(file,...args);}) as any);}
  if(kind==='log'){const original=fs.openSync;vi.spyOn(fs,'openSync').mockImplementation(((file:any,...args:any[])=>{if(String(file).endsWith('run.log'))throw Error('fixture log open failure');return (original as any)(file,...args);}) as any);}
  if(kind==='spawn')fixture.launch.mockImplementationOnce(()=>{throw Error('fixture spawn failure');});
  await expect(resume(recovery(dir))).rejects.toThrow();expect(fixture.bridges).toHaveLength(2);expect(fixture.bridges[1].close).toHaveBeenCalledTimes(1);expect(workers).toHaveLength(1);
 });
 it.each(['config','status','stdin'])('aborts only the newly spawned worker and bridge if %s ownership handoff fails',async(kind)=>{
  const s=await service.detectiveStart(request()),dir=s.directory!;pause(dir,'connect');
  if(kind!=='stdin'){const original=fs.writeFileSync;vi.spyOn(fs,'writeFileSync').mockImplementation(((file:any,data:any,...rest:any[])=>{const name=String(file);if((kind==='config'&&name===path.join(fixture.root,'artist-detective-runtime.json'))||(kind==='status'&&name===path.join(dir,'status.json')&&String(data).includes('"stage":"loading"')))throw Error('fixture '+kind+' persistence failure');return (original as any)(file,data,...rest);}) as any);}
  else {const original=PassThrough.prototype.end;vi.spyOn(PassThrough.prototype,'end').mockImplementation(function(this:PassThrough,...args:any[]){if(this===workers[1]?.stdin)throw Error('fixture stdin handoff failure');return (original as any).apply(this,args);} as any);}
  await expect(resume(recovery(dir))).rejects.toThrow('fixture '+kind);expect(workers).toHaveLength(2);expect(workers[1].stdin.destroyed).toBe(true);expect(workers[1].kill).toHaveBeenCalledTimes(1);expect(fixture.bridges[1].close).toHaveBeenCalledTimes(1);expect(fs.existsSync(path.join(dir,'run-manifest.json'))).toBe(true);
 });
});
