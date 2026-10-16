// Transport unit fixtures only: they cannot qualify a platform/feature receipt.
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createNativeProof} from './native-proof-stream.mjs';
const sourceSha='a'.repeat(40),profileSha='b'.repeat(64),platform='android',testEntry='gallery3';
const common={sourceSha,profileSha,platform,paidCalls:0};
const begin={...common,testEntry,expectedChecks:1,nativePid:1234,mockOnly:false,nativeOnly:true,kind:'device'};
const check={...common,mockOnly:false,kind:'device',status:'passed',feature:'online-gallery',scenario:'transport-unit-only',observed:{literal:'龙白🙂'.repeat(1000)}};
const options={sourceSha,profileSha,platform,testEntry,expectedChecks:1,requireNativeBegin:true};
const marker=(kind,v)=>`FEATURE_ACCEPTANCE_${kind}:`+JSON.stringify(v);
const end=marker('DONE',{...common,checks:1,exitStatus:0});
function packets(payload=check){const bytes=Buffer.from(JSON.stringify(payload)),count=Math.ceil(bytes.length/384),sha256=crypto.createHash('sha256').update(bytes).digest('hex');return Array.from({length:count},(_,index)=>({v:1,pid:1234,entry:testEntry,id:1,index,count,bytes:bytes.length,sha256,data:bytes.subarray(index*384,Math.min(bytes.length,(index+1)*384)).toString('base64')}));}
const chunk=p=>'I/flutter NATIVE_PROOF_CHUNK:'+JSON.stringify(p);
function parse(parts,extra=[]){const p=createNativeProof(options);p.line(marker('BEGIN',begin));for(const x of parts)p.line(typeof x==='string'?x:chunk(x));for(const x of extra)p.line(x);p.line(end);return p.finish();}
test('explicit hash/length framing preserves exact large Unicode record under physical line bound',()=>{const all=packets();assert(all.every(p=>Buffer.byteLength(chunk(p))<900));const result=parse(all);assert.equal(result.passed,true,JSON.stringify(result.errors));assert.deepEqual(result.checks,[check]);});
test('legacy truncated JSON is never repaired or accepted from later continuation',()=>{const line=marker('CHECK',check);assert.equal(parse([line.slice(0,1024),line.slice(1024)]).passed,false);});
for(const[name,fn]of Object.entries({missingFirst:p=>p.slice(1),missingMiddle:p=>p.filter((_,i)=>i!==2),missingLast:p=>p.slice(0,-1),duplicate:p=>[p[0],...p],reverse:p=>p.toReversed(),wrongPid:p=>p.map(x=>({...x,pid:999})),wrongEntry:p=>p.map(x=>({...x,entry:'text15'})),wrongId:p=>p.map(x=>({...x,id:2})),wrongSha:p=>p.map(x=>({...x,sha256:'c'.repeat(64)})),mixedHeaders:p=>p.map((x,i)=>i===2?({...x,bytes:x.bytes+1}):x),unknownField:p=>p.map(x=>({...x,extra:true})),invalidBase64:p=>p.map((x,i)=>i?x:({...x,data:'!bad!'})),mismatchedLength:p=>p.map((x,i)=>i?x:({...x,data:'YQ=='}))}))test('explicit chunk parser rejects '+name,()=>assert.equal(parse(fn(packets())).passed,false));
test('hash-valid payload still needs original source/profile/platform/native/count safety',()=>{for(const change of [{sourceSha:'c'.repeat(40)},{platform:'ios'},{paidCalls:1},{mockOnly:true},{kind:'unit'},{status:'pending'}])assert.equal(parse(packets({...check,...change})).passed,false);});
test('unframed proof during partial chunk is an error, never a count shortcut',()=>{const p=packets();assert.equal(parse([p[0],marker('CHECK',check),...p.slice(1)]).passed,false);});
test('chunk before required BEGIN and arbitrary/malformed markers fail closed',()=>{const p=createNativeProof(options);p.line(chunk(packets()[0]));p.line(marker('BEGIN',begin));p.line(marker('CHECK',check));p.line(end);assert.equal(p.finish().passed,false);assert.equal(parse(['NATIVE_PROOF_CHUNK:{bad}']).passed,false);});
for(const prefix of ['Unhandled Exception: actual failure ','FEATURE_NATIVE_ASYNC_ERROR: actual failure '])test('real async failure on a chunk-bearing physical line is not swallowed: '+prefix,()=>{
 const parts=packets();const lines=parts.map(chunk);lines[0]=prefix+lines[0];assert.equal(parse(lines).passed,false);
});
