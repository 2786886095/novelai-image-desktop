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
let buffer='';process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const [request]=JSON.parse(line);if(request.method==='app.stop'&&request.params.appId==='unit-app'){frame({id:request.id,result:true});frame({event:'app.stop',params:{appId:'unit-app'}});process.exitCode=0;process.stdin.destroy();}}});
`;
async function collect(mode,value=pending){return collectResidentFlutter({command:[process.execPath,'-e',child,mode,JSON.stringify(value),JSON.stringify(check),JSON.stringify(done),JSON.stringify(begin)],cwd:process.cwd(),env:process.env,sourceSha,profileSha,platform,testEntry,device,expectedChecks:1,timeoutMs:5000,journeyTimeoutMs:3000,completionTailMs:10,stopGraceMs:1000});}
test('resident current-app PENDING is kept separate through successful stop/close',{timeout:10000},async()=>{const r=await collect('valid');assert.equal(r.passed,true,r.errors.join('; '));assert.equal(r.actualCloseCode,0);assert.equal(r.stopReply.result,true);assert.equal(r.pending.length,1);assert.equal(r.checks.length,1);});
test('resident rejects PENDING before matching current app.start',{timeout:10000},async()=>{const r=await collect('before-start');assert.equal(r.passed,false);assert.match(r.errors.join('; '),/before matching current app.start/);});
test('resident cannot lose external profile binding for PENDING',{timeout:10000},async()=>{const r=await collect('valid',{...pending,profileSha:'c'.repeat(64)});assert.equal(r.passed,false);assert.equal(r.pending.length,0);assert.match(r.errors.join('; '),/PENDING.*identity mismatch/);});
