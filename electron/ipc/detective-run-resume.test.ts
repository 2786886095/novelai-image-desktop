import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createDetectiveRunManifest,detectiveOwnedRun,detectiveRecovery,detectiveVerifiedResults,readDetectiveRunManifest,verifyDetectiveRunBinding,type DetectiveBinding} from './detective-run-resume';
let root:string,run:string,binding:DetectiveBinding;
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const write=(p:string,s:string)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-resume-helper-'));run=path.join(root,'artist-detective-runs',randomUUID());fs.mkdirSync(run,{recursive:true});write(path.join(root,'python.exe'),'python');write(path.join(root,'runner.py'),'runner');write(path.join(root,'assets/manifest.json'),'{}');write(path.join(root,'reference.png'),'reference');binding={python:path.join(root,'python.exe'),assets:path.join(root,'assets'),runner:path.join(root,'runner.py'),variant:'full',token:'FIXTURE_HIGH_ENTROPY_TOKEN_1234567890',imageBaseUrl:'https://fixture.invalid',accountId:'fixture'};});
afterEach(()=>fs.rmSync(root,{recursive:true,force:true}));
const create=()=>createDetectiveRunManifest(run,{image:path.join(root,'reference.png'),prompt:'1girl',style:'cel shading',budget:300},binding);
it('binds owned directory, full payload and a byte-exact reference without persisting credentials',()=>{const {manifest:m,manifestSha256:h}=create();expect(detectiveOwnedRun(root,run)).toBe(run);expect(readDetectiveRunManifest(run,h)).toEqual(m);expect(()=>verifyDetectiveRunBinding(m,binding)).not.toThrow();expect(JSON.stringify(m)).not.toContain(binding.token);expect(m.payloadIdentity).toBe(sha(JSON.stringify(m.request)));});
it('does not change the frozen original when the source reference changes later',()=>{const {manifest:m}=create();write(path.join(root,'reference.png'),'new user image');expect(()=>verifyDetectiveRunBinding(m,binding)).not.toThrow();expect(fs.readFileSync(m.reference.path,'utf8')).toBe('reference');});
it('rejects mutation of manifest, frozen bytes and runtime identity',()=>{const {manifest:m,manifestSha256:h}=create();write(path.join(run,'run-manifest.json'),JSON.stringify({...m,request:{...m.request,prompt:'changed'}}));expect(()=>readDetectiveRunManifest(run,h)).toThrow();write(m.reference.path,'changed');expect(()=>verifyDetectiveRunBinding(m,binding)).toThrow();});
it('does not accept arbitrary sibling runs or directory aliases (real Windows junction / POSIX symlink)',()=>{create();const other=path.join(root,'not-owned',path.basename(run));fs.mkdirSync(other,{recursive:true});expect(()=>detectiveOwnedRun(root,other)).toThrow();const link=path.join(root,'artist-detective-runs',randomUUID());fs.symlinkSync(run,link,process.platform==='win32'?'junction':'dir');expect(()=>detectiveOwnedRun(root,link)).toThrow();});
it('verifies cached files and rejects modified/missing images rather than lowering the completed count',()=>{create();const key='a'.repeat(64),image=path.join(run,'spool/results/native',key+'.png');write(image,'cached');write(image.slice(0,-4)+'.json',JSON.stringify({request_hash:key,image,image_sha256:sha('cached')}));expect(detectiveVerifiedResults(run).count).toBe(1);write(image,'corrupt');expect(()=>detectiveVerifiedResults(run)).toThrow();fs.unlinkSync(image);expect(()=>detectiveVerifiedResults(run)).toThrow();});
it('requires explicit paid consent when an old transport marker lacks trustworthy outcome metadata',()=>{const {manifestSha256:h}=create();const key='a'.repeat(64);write(path.join(run,'spool/requests',key+'.json'),JSON.stringify({request_hash:key}));write(path.join(run,'failure.json'),JSON.stringify({paused:true,pendingRequestHash:key,reason:'connect'}));expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:key,requiresPaidReplayConfirmation:true});});
it('rejects duplicate/multiple unresolved requests and never fabricates a legacy binding',()=>{const {manifestSha256:h}=create();for(const key of ['a'.repeat(64),'b'.repeat(64)])write(path.join(run,'spool/requests',key+'.json'),JSON.stringify({request_hash:key}));expect(detectiveRecovery(run,h).supported).toBe(false);expect(detectiveRecovery(run).supported).toBe(false);});
it.each(['https://user:secret@fixture.invalid','https://fixture.invalid?token=secret','http://outside.invalid'])('rejects unsafe/secret-bearing endpoint before a manifest is persisted: %s',endpoint=>{binding.imageBaseUrl=endpoint;expect(create).toThrow();expect(fs.existsSync(path.join(run,'run-manifest.json'))).toBe(false);});

const recoveryKey='c'.repeat(64),otherRecoveryKey='d'.repeat(64);
const pendingMarker=(key=recoveryKey)=>write(path.join(run,'spool/requests',key+'.json'),JSON.stringify({request_hash:key}));
const rejectedReceipt=(kind:'connect'|'rate_limited',key=recoveryKey)=>({request_hash:key,pendingRequestHash:key,status:kind==='connect'?'connect':429,reason:kind,requiresPaidReplayConfirmation:false,safeCode:kind==='connect'?'dns':'other'});
const saveReceipt=(value:unknown,key=recoveryKey)=>write(path.join(run,'spool/transport-errors',key+'.json'),JSON.stringify(value));

it.each(['connect','rate_limited'] as const)('uses the actual pending request to validate a %s receipt despite missing or stale progress',kind=>{
 const {manifestSha256:h}=create();pendingMarker();saveReceipt(rejectedReceipt(kind));
 // A WinError5 while replacing status may leave it missing, with only request_hash,
 // or pointing at an older request. None may override the durable pending identity.
 for(const progress of [undefined,{stage:'generating',request_hash:recoveryKey},{stage:'paused',pendingRequestHash:otherRecoveryKey}]) {
  const file=path.join(run,'status.json');if(progress)write(file,JSON.stringify(progress));else if(fs.existsSync(file))fs.unlinkSync(file);
  write(path.join(run,'failure.json'),JSON.stringify({type:'PermissionError',message:'synthetic local status replacement denied'}));
  expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:false});
 }
});
it.each(['connect','rate_limited'] as const)('does not let stale paused failure metadata hide a matching %s receipt',kind=>{
 const {manifestSha256:h}=create();pendingMarker();saveReceipt(rejectedReceipt(kind));
 write(path.join(run,'status.json'),JSON.stringify({stage:'generating',request_hash:recoveryKey}));
 write(path.join(run,'failure.json'),JSON.stringify({paused:true,pendingRequestHash:otherRecoveryKey,requiresPaidReplayConfirmation:true}));
 expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:false});
});
it.each(['connect','rate_limited'] as const)('recognizes a complete matching %s receipt without changing the frozen run',kind=>{
 const {manifestSha256:h}=create();pendingMarker();const receipt=rejectedReceipt(kind);saveReceipt(receipt);
 write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey}));
 const bytes=fs.readFileSync(path.join(run,'spool/transport-errors',recoveryKey+'.json'));
 expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:false});
 expect(fs.readFileSync(path.join(run,'spool/transport-errors',recoveryKey+'.json'))).toEqual(bytes);
});
for(const kind of ['connect','rate_limited'] as const)for(const field of ['status','reason','request_hash','pendingRequestHash','requiresPaidReplayConfirmation'] as const){
 it(`keeps ${kind} receipt with missing ${field} uncertain`,()=>{
  const {manifestSha256:h}=create();pendingMarker();const saved:any=rejectedReceipt(kind);delete saved[field];saveReceipt(saved);
  write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey}));
  expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:true});
 });
}
for(const kind of ['connect','rate_limited'] as const)for(const mutation of ['request_hash','pendingRequestHash','reason','requiresPaidReplayConfirmation'] as const){
 it(`keeps ${kind} receipt with forged ${mutation} uncertain`,()=>{
  const {manifestSha256:h}=create();pendingMarker();const saved:any=rejectedReceipt(kind);
  saved[mutation]=mutation==='requiresPaidReplayConfirmation'?true:mutation==='reason'?'uncertain':otherRecoveryKey;saveReceipt(saved);
  write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey}));
  expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:true});
 });
}
it.each(['connect','rate_limited'] as const)('does not borrow a different request hash %s receipt',kind=>{
 const {manifestSha256:h}=create();pendingMarker();saveReceipt(rejectedReceipt(kind,otherRecoveryKey),otherRecoveryKey);
 write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:false,reason:kind}));
 expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:true});
});
it.each(['missing','uncertain'] as const)('never excuses a %s outcome because the local status write failed',kind=>{
 const {manifestSha256:h}=create();pendingMarker();if(kind==='uncertain')saveReceipt({...rejectedReceipt('connect'),status:'uncertain',reason:'uncertain',requiresPaidReplayConfirmation:true});
 write(path.join(run,'failure.json'),JSON.stringify({type:'PermissionError',message:'synthetic local status replacement denied'}));
 expect(detectiveRecovery(run,h)).toMatchObject({supported:true,pendingRequestHash:recoveryKey,requiresPaidReplayConfirmation:true});
});
it('does not manufacture a pending request from stale status or failure metadata',()=>{
 const {manifestSha256:h}=create();write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey}));
 write(path.join(run,'failure.json'),JSON.stringify({paused:true,pendingRequestHash:otherRecoveryKey,requiresPaidReplayConfirmation:true}));saveReceipt(rejectedReceipt('connect'));
 const recovery=detectiveRecovery(run,h);expect(recovery).toMatchObject({supported:true,requiresPaidReplayConfirmation:false});expect(recovery.pendingRequestHash).toBeUndefined();
});
it('reuses a committed result despite stale pending metadata after a local status failure',()=>{
 const {manifestSha256:h}=create();pendingMarker();const image=path.join(run,'spool/results/native',recoveryKey+'.png');write(image,'cached-result');
 write(image.slice(0,-4)+'.json',JSON.stringify({request_hash:recoveryKey,image,image_sha256:sha('cached-result')}));
 write(path.join(run,'failure.json'),JSON.stringify({type:'PermissionError',message:'synthetic local status replacement denied'}));
 write(path.join(run,'status.json'),JSON.stringify({stage:'paused',pendingRequestHash:recoveryKey}));
 const recovery=detectiveRecovery(run,h);expect(recovery).toMatchObject({supported:true,requiresPaidReplayConfirmation:false});expect(recovery.pendingRequestHash).toBeUndefined();expect(detectiveVerifiedResults(run).count).toBe(1);
});
