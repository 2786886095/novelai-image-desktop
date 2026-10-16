import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNativeProof} from './native-proof-stream.mjs';
import {mobileNativeEntries,isMobileScenarioEntry} from './mobile-entry-specs.mjs';
const sourceSha='a'.repeat(40),profileSha='b'.repeat(64);
function fixture(entry,change={},omitBegin=false,platform=mobileNativeEntries[entry].platforms?.[0]??'ios'){
 const expectedChecks=mobileNativeEntries[entry].expectedChecks;
 const p=createNativeProof({sourceSha,profileSha,platform,testEntry:entry,expectedChecks,requireNativeBegin:true});
 const base={sourceSha,profileSha,platform,paidCalls:0};
 const begin={...base,testEntry:entry,expectedChecks,nativePid:4242,mockOnly:false,kind:'device',nativeOnly:true,...change};
 const emit=(type,value)=>p.line(`FEATURE_ACCEPTANCE_${type}:`+JSON.stringify(value));
 if(!omitBegin)emit('BEGIN',begin);
 for(let i=0;i<expectedChecks;i++)emit('CHECK',{...base,kind:'device',status:'passed',mockOnly:false,feature:'settings',scenario:'parser-unit-fixture-'+i});
 emit('DONE',{...base,checks:expectedChecks,exitStatus:0});
 return p.finish();
}
for(const entry of Object.keys(mobileNativeEntries).filter(e=>isMobileScenarioEntry(e)&&e!=='release_parity7')){
 test(entry+' accepts its real NativeScenarios BEGIN/PID shape at the fixed count',()=>{const r=fixture(entry);assert.equal(r.passed,true,JSON.stringify(r.errors));assert.equal(r.begin.testEntry,entry);assert.equal(r.begin.nativePid,4242);assert.equal(r.checks.length,mobileNativeEntries[entry].expectedChecks);});
 test(entry+' rejects a complete-looking stream without its required native BEGIN',()=>{const r=fixture(entry,{},true);assert.equal(r.passed,false);assert.match(r.errors.join(' '),/required|Required/);});
}
for(const [name,change]of Object.entries({zeroPid:{nativePid:0},negativePid:{nativePid:-1},fractionPid:{nativePid:1.5},stringPid:{nativePid:'4242'},nullPid:{nativePid:null},unsafePid:{nativePid:2147483648},missingPid:{nativePid:undefined},unknownEntry:{testEntry:'not-registered'},wrongSource:{sourceSha:'c'.repeat(40)},wrongProfile:{profileSha:'c'.repeat(64)},wrongPlatform:{platform:'android'},notNative:{nativeOnly:false},mock:{mockOnly:true},paid:{paidCalls:1},wrongCount:{expectedChecks:1},extraField:{unproved:true}}))test('registered stream rejects '+name,()=>assert.equal(fixture('text15',change).passed,false));
test('run-mobile-native explicitly enforces BEGIN for NativeScenarios and forwards to both parsers',()=>{const text=fs.readFileSync(new URL('./run-mobile-native.mjs',import.meta.url),'utf8');assert.match(text,/const requireNativeBegin=isMobileScenarioEntry\(input\.entry\)&&input\.entry!=='release_parity7'/);assert.equal((text.match(/profileSha256 : undefined, requireNativeBegin/g)??[]).length,2);assert.match(text,/collectResidentFlutter\([\s\S]*?requireNativeBegin,/);});
test('Android-only native updater BEGIN cannot pass as an iOS process',()=>assert.equal(fixture('android_update2',{},false,'ios').passed,false));
test('iOS-only native updater BEGIN cannot pass as an Android process',()=>assert.equal(fixture('ios_update2',{},false,'android').passed,false));
