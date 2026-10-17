import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createDetectiveRunManifest,detectiveOwnedRun,detectiveRecovery,detectiveVerifiedResults,readDetectiveRunManifest,verifyDetectiveRunBinding,type DetectiveBinding,type DetectiveRunManifest} from './detective-run-resume';

const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const write=(file:string,bytes:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
let base:string,physical:string,alias:string,userData:string,run:string,binding:DetectiveBinding;
let links:string[];
function link(target:string,file:string){fs.symlinkSync(target,file,process.platform==='win32'?'junction':'dir');links.push(file);}
function create(){return createDetectiveRunManifest(run,{image:path.join(userData,'input.png'),prompt:'1girl',style:'cel shading',budget:300},binding);}
function changedManifest(m:DetectiveRunManifest){const text=JSON.stringify(m);fs.writeFileSync(path.join(run,'run-manifest.json'),text);return sha(text);}
function cache(index:number){
  const key=sha('request-'+index),branch=path.join(run,'spool/results/native');
  const image=path.join(branch,key+'.png');write(image,'cached-'+index);
  // The real Python runner resolves output before creating its RequestStore.
  const canonicalImage=fs.realpathSync(image);
  write(path.join(branch,key+'.json'),JSON.stringify({request_hash:key,image:canonicalImage,image_sha256:sha('cached-'+index)}));
  return {key,image,canonicalImage,json:path.join(branch,key+'.json')};
}
beforeEach(()=>{
  base=fs.mkdtempSync(path.join(os.tmpdir(),'detective-parent-alias-'));physical=path.join(base,'physical');alias=path.join(base,'parent-alias');links=[];fs.mkdirSync(physical);link(physical,alias);
  userData=path.join(alias,'profile');run=path.join(userData,'artist-detective-runs',randomUUID());fs.mkdirSync(run,{recursive:true});
  write(path.join(userData,'python.exe'),'fixture python');write(path.join(userData,'runner.py'),'fixture runner');write(path.join(userData,'assets/manifest.json'),'{}');write(path.join(userData,'input.png'),'fixture reference');
  binding={python:path.join(userData,'python.exe'),runner:path.join(userData,'runner.py'),assets:path.join(userData,'assets'),variant:'full',token:'SYNTHETIC_ALIAS_FIXTURE_TOKEN_123456789',accountId:'synthetic',imageBaseUrl:'https://fixture.invalid'};
  expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
  expect(fs.realpathSync(run)).not.toBe(path.resolve(run));
});
afterEach(()=>{
  // Remove only our exact directory links before deleting their private fixture.
  for(const p of links.reverse()){try{fs.unlinkSync(p);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  fs.rmSync(base,{recursive:true,force:true});
});

it('reads canonical frozen reference through a real trusted parent directory alias',()=>{
  const {manifest,manifestSha256}=create();
  expect(detectiveOwnedRun(userData,run)).toBe(run);
  expect(manifest.reference.path).toBe(fs.realpathSync(path.join(run,'reference.png')));
  expect(readDetectiveRunManifest(run,manifestSha256)).toEqual(manifest);
  expect(()=>verifyDetectiveRunBinding(manifest,binding)).not.toThrow();
});

it('counts137 Python-style canonical cached outputs without changing their bytes or the300 budget',()=>{
  const {manifest}=create(),first=cache(0);for(let i=1;i<137;i++)cache(i);
  const before=fs.readFileSync(first.image);
  expect(detectiveVerifiedResults(run).count).toBe(137);
  expect(detectiveVerifiedResults(fs.realpathSync(run)).count).toBe(137);
  expect(fs.readFileSync(first.image)).toEqual(before);expect(manifest.request.budget).toBe(300);
});

it('keeps an unresolved aliased run recoverable but requires explicit paid consent',()=>{
  const {manifestSha256}=create(),key='a'.repeat(64);
  write(path.join(run,'spool/requests',key+'.json'),JSON.stringify({request_hash:key}));
  write(path.join(run,'failure.json'),JSON.stringify({paused:true,pendingRequestHash:key,reason:'uncertain'}));
  expect(detectiveRecovery(run,manifestSha256)).toMatchObject({supported:true,manifestSha256,pendingRequestHash:key,requiresPaidReplayConfirmation:true});
});

it('rejects a different canonical cache file even when its bytes have the expected hash',()=>{
  create();const row=cache(0),other=path.join(run,'other.png');write(other,'cached-0');
  write(row.json,JSON.stringify({request_hash:row.key,image:fs.realpathSync(other),image_sha256:sha('cached-0')}));
  expect(()=>detectiveVerifiedResults(run)).toThrow();
});

it('rejects a corrupted canonical cache rather than lowering completed count',()=>{
  create();const row=cache(0);fs.appendFileSync(row.canonicalImage,' changed');
  expect(()=>detectiveVerifiedResults(run)).toThrow();
});

it.each(['manifest','reference'])('still rejects changed %s bytes under the trusted parent alias',kind=>{
  const {manifest,manifestSha256}=create();
  if(kind==='manifest'){fs.appendFileSync(path.join(run,'run-manifest.json'),' ');expect(()=>readDetectiveRunManifest(run,manifestSha256)).toThrow();}
  else{fs.appendFileSync(manifest.reference.path,' changed');expect(()=>verifyDetectiveRunBinding(manifest,binding)).toThrow();}
});

it.each(['sibling','prefix-lookalike'])('rejects canonical %s paths outside the owned run',kind=>{
  const {manifest}=create(),outside=kind==='sibling'?path.join(userData,'outside.png'):fs.realpathSync(run)+'-other/reference.png';write(outside,'fixture reference');
  manifest.reference.path=fs.realpathSync(outside);const h=changedManifest(manifest);
  expect(()=>readDetectiveRunManifest(run,h)).toThrow();
});

it.each(['inside','outside'])('rejects every descendant directory link even when it points %s the run',kind=>{
  const {manifest}=create(),target=kind==='inside'?path.join(run,'real-child'):path.join(physical,'outside-child');fs.mkdirSync(target,{recursive:true});write(path.join(target,'reference.png'),'fixture reference');
  const child=path.join(run,'linked-child');link(target,child);manifest.reference.path=path.join(child,'reference.png');const h=changedManifest(manifest);
  expect(()=>readDetectiveRunManifest(run,h)).toThrow();
});

it.each(['run','runs-root'])('still rejects a linked owned %s, not just escapes',kind=>{
  create();
  if(kind==='run'){const linked=path.join(userData,'artist-detective-runs',randomUUID());link(fs.realpathSync(run),linked);expect(()=>detectiveOwnedRun(userData,linked)).toThrow();}
  else{const root=path.join(userData,'artist-detective-runs'),moved=path.join(userData,'moved-runs');fs.renameSync(root,moved);link(fs.realpathSync(moved),root);expect(()=>detectiveOwnedRun(userData,run)).toThrow();}
});

it('never fabricates a legacy manifest binding through a parent alias',()=>{
  create();expect(detectiveRecovery(run).supported).toBe(false);
});
