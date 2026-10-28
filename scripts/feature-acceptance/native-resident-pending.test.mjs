import test from 'node:test';
import assert from 'node:assert/strict';
import {collectResidentFlutter} from './native-proof-stream.mjs';
// Transport protocol unit fixtures only. No Flutter device or feature is claimed.
const sourceSha='a'.repeat(40), profileSha='b'.repeat(64), platform='ios',device='unit-device',testEntry='library33';
const begin={sourceSha,profileSha,platform,testEntry,nativeOnly:true,kind:'device',mockOnly:false,paidCalls:0,expectedChecks:1};
const pending={sourceSha,profileSha,platform,testEntry,nativeOnly:true,paidCalls:0,mockOnly:false,kind:'device',feature:'agent-components',status:'pending',reason:'Unit fixture: no process activation observed'};
const check={sourceSha,profileSha,platform,paidCalls:0,mockOnly:false,kind:'device',status:'passed',feature:'unit-fixture'};
const done={sourceSha,profileSha,platform,paidCalls:0,checks:1,exitStatus:0};
const child=String.raw`
const [mode,p,c,d,b]=process.argv.slice(1).map((v,i)=>i?JSON.parse(v):v);
const frame=v=>process.stdout.write(JSON.stringify([v])+'\n');
const log=v=>frame({event:'app.log',params:{appId:'unit-app',log:v}});
const marker='FEATURE_ACCEPTANCE_PENDING:'+JSON.stringify(p);
if(mode==='before-start')process.stdout.write(marker+'\n');
frame({event:'app.start',params:{appId:'unit-app',deviceId:'unit-device'}});
log('FEATURE_ACCEPTANCE_BEGIN:'+JSON.stringify(b));
if(mode!=='before-start')log(marker);
frame({event:'app.started',params:{appId:'unit-app'}});
log('FEATURE_ACCEPTANCE_CHECK:'+JSON.stringify(c));
log('FEATURE_ACCEPTANCE_DONE:'+JSON.stringify(d));
let buffer='';process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const [request]=JSON.parse(line);if(request.method==='app.stop'&&request.params.appId==='unit-app'){process.stdout.write('UNIT_STOP_AT:'+Date.now()+'\n');frame({id:request.id,result:true});frame({event:'app.stop',params:{appId:'unit-app'}});process.exitCode=0;process.stdin.destroy();}}});
`;
async function collect(mode,value=pending,extra={}){return collectResidentFlutter({command:[process.execPath,'-e',child,mode,JSON.stringify(value),JSON.stringify(check),JSON.stringify(done),JSON.stringify(begin)],cwd:process.cwd(),env:process.env,sourceSha,profileSha,platform,testEntry,device,expectedChecks:1,timeoutMs:5000,journeyTimeoutMs:3000,completionTailMs:10,stopGraceMs:1000,...extra});}
test('resident current-app PENDING is kept separate through successful stop/close',{timeout:10000},async()=>{const r=await collect('valid');assert.equal(r.passed,true,r.errors.join('; '));assert.equal(r.actualCloseCode,0);assert.equal(r.stopReply.result,true);assert.equal(r.pending.length,1);assert.equal(r.checks.length,1);});
test('resident rejects PENDING before matching current app.start',{timeout:10000},async()=>{const r=await collect('before-start');assert.equal(r.passed,false);assert.match(r.errors.join('; '),/before matching current app.start/);});
test('resident cannot lose external profile binding for PENDING',{timeout:10000},async()=>{const r=await collect('valid',{...pending,profileSha:'c'.repeat(64)});assert.equal(r.passed,false);assert.equal(r.pending.length,0);assert.match(r.errors.join('; '),/PENDING.*identity mismatch/);});

test('an asynchronous real-OS observer completes before app.stop; DONE cannot terminate its target early',{timeout:10000},async()=>{
 let observed=0,finishedAt=0;const r=await collect('valid',pending,{onNativeLine:text=>{if(!text.includes('FEATURE_ACCEPTANCE_PENDING:'))return;observed++;return new Promise(resolve=>setTimeout(()=>{finishedAt=Date.now();resolve()},120));}});
 assert.equal(r.passed,true,r.errors.join('; '));assert.equal(observed,1);const stop=Number(/UNIT_STOP_AT:(\d+)/.exec(r.stdout)?.[1]);assert(Number.isFinite(stop)&&stop>=finishedAt,'app.stop preceded external OS-driver completion');
});
test('failed synchronous or asynchronous OS observers cannot be hidden by successful native DONE',{timeout:10000},async()=>{
 for(const asynchronous of [false,true]){const r=await collect('valid',pending,{onNativeLine:text=>{if(!text.includes('FEATURE_ACCEPTANCE_PENDING:'))return;if(asynchronous)return Promise.reject(Error('unit observer rejection'));throw Error('unit observer rejection');}});assert.equal(r.passed,false);assert.match(r.errors.join('; '),/Native OS observer failed.*unit observer rejection/);assert.equal(r.terminationReason,'native-observer-failed');}
});
test('an unfinished OS observer cannot hang beyond the independent native journey bound',{timeout:10000},async()=>{
 const start=Date.now();const r=await collect('valid',pending,{journeyTimeoutMs:100,onNativeLine:text=>text.includes('FEATURE_ACCEPTANCE_PENDING:')?new Promise(()=>{}):undefined});assert.equal(r.passed,false);assert.match(r.errors.join('; '),/observer exceeded bounded journey deadline/);assert(Date.now()-start<5000);
});

// Real owned POSIX process lifecycle fixtures only; no Flutter/device evidence.
// Explicit signal/pipe ordering makes the formerly intermittent race causal.
const signalChild=String.raw`
const fs=require('node:fs');
const [mode,p,c,d,b]=process.argv.slice(1).map((v,i)=>i?JSON.parse(v):v);
const frame=v=>JSON.stringify([v])+'\n';
const log=v=>frame({event:'app.log',params:{appId:'unit-app',log:v}});
let closing=false;
const closeInput=()=>{process.stdin.pause();try{fs.closeSync(0);process.stdout.write('UNIT_FD0_CLOSED:'+process.pid+'\n')}catch(error){process.stdout.write('UNIT_CLOSE_ERROR:'+error.code+'\n')}};
process.stdin.on('error',()=>{});process.stdin.resume();
process.on('SIGTERM',()=>{
 if(mode==='repeat-errors')return;
 if(closing)return;closing=true;
 if(mode==='observer-first')closeInput();
 if(mode==='stdin-first')process.stdout.write(log('UNIT_SECONDARY_OBSERVER_FAILURE'));
 setTimeout(()=>process.exit(0),200);
});
setTimeout(()=>process.exit(99),5000);setInterval(()=>{},1000);
if(mode==='stdin-first')closeInput();
let output='UNIT_CHILD_PID:'+process.pid+'\n'+frame({event:'app.start',params:{appId:'unit-app',deviceId:'unit-device'}})+log('FEATURE_ACCEPTANCE_BEGIN:'+JSON.stringify(b));
if(mode==='repeat-errors'){
 process.stdout.write(output+log('UNIT_REPEATED_OBSERVER_FAILURE')+log('UNIT_REPEATED_OBSERVER_FAILURE'));
 setInterval(()=>process.stdout.write(log('UNIT_REPEATED_OBSERVER_FAILURE')),25);
 setTimeout(()=>process.exit(0),500);
}else{
 if(mode==='observer-first')output+=log('FEATURE_ACCEPTANCE_PENDING:'+JSON.stringify(p));
 process.stdout.write(output+frame({event:'app.started',params:{appId:'unit-app'}})+log('FEATURE_ACCEPTANCE_CHECK:'+JSON.stringify(c))+log('FEATURE_ACCEPTANCE_DONE:'+JSON.stringify(d)));
}
`;
function assertOwnedChildGone(result){
 assert(Number.isSafeInteger(result.childPid)&&result.childPid>0);
 assert.throws(()=>process.kill(result.childPid,0),error=>error.code==='ESRCH','owned fixture child is still alive');
}
function collectSignal(mode,onNativeLine,extra={}){
 return collect('valid',pending,{command:[process.execPath,'-e',signalChild,mode,JSON.stringify(pending),JSON.stringify(check),JSON.stringify(done),JSON.stringify(begin)],onNativeLine,...extra});
}
test('observer failure is terminal before DONE/ready can queue app.stop against closed real stdin',{skip:process.platform==='win32',timeout:10000},async()=>{
 for(const asynchronous of [false,true]){
  const r=await collectSignal('observer-first',text=>{
   if(!text.includes('FEATURE_ACCEPTANCE_PENDING:'))return;
   if(asynchronous)return Promise.reject(Error('primary observer failure'));
   throw Error('primary observer failure');
  });
  assertOwnedChildGone(r);assert.equal(r.passed,false);assert.equal(r.terminationReason,'native-observer-failed');
  assert.match(r.errors.join('; '),/Native OS observer failed.*primary observer failure/);
  assert.equal(r.stdinCommands.length,0,'failure queued a later successful app.stop phase');
  assert.equal(r.stopDeadline,null,'failure re-armed a stop deadline');
  // A rejected Promise settles after the same output chunk may start a valid
  // journey. Only the synchronous throw necessarily precedes ready/CHECK.
  if(!asynchronous)assert.equal(r.journeyStarted,false,'trailing ready/CHECK re-armed a journey deadline');
  assert.match(r.stdout,/UNIT_FD0_CLOSED:/);
 }
});
test('actual stdin-stop error remains the first failure when a later OS observer also fails',{skip:process.platform==='win32',timeout:10000},async()=>{
 for(const asynchronous of [false,true]){
  const r=await collectSignal('stdin-first',text=>{
   if(!text.includes('UNIT_SECONDARY_OBSERVER_FAILURE'))return;
   if(asynchronous)return Promise.reject(Error('secondary observer failure'));
   throw Error('secondary observer failure');
  });
  assertOwnedChildGone(r);assert.equal(r.passed,false);assert.equal(r.terminationReason,'stdin-stop-error');
  assert.equal(r.stdinCommands.length,1);assert.match(r.errors.join('; '),/EPIPE/);
  assert.match(r.errors.join('; '),/Native OS observer failed.*secondary observer failure/);
 }
});
test('repeated observer errors cannot extend the original bounded SIGKILL grace',{skip:process.platform==='win32',timeout:10000},async()=>{
 const r=await collectSignal('repeat-errors',text=>{if(text.includes('UNIT_REPEATED_OBSERVER_FAILURE'))throw Error('repeated observer failure')},{stopGraceMs:100});
 assertOwnedChildGone(r);assert.equal(r.passed,false);assert.equal(r.terminationReason,'native-observer-failed');
 assert.equal(r.actualCloseSignal,'SIGKILL');assert.equal(r.stdinCommands.length,0);
 assert(r.errors.filter(error=>error.includes('Native OS observer failed:')).length>=2,'secondary observer errors were discarded');
});
