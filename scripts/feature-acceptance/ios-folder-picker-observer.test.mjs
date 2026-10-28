// Real host subprocess/liveness tests only. Synthetic launchctl/XCTest output
// is never a native acceptance receipt or proof of an actual Files picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createIosFolderPickerObserver} from './ios-folder-picker-driver.mjs';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';
const sourceSha='a'.repeat(40),profileSha='b'.repeat(64),nativePid=5317;
const begin={sourceSha,profileSha,nativePid,platform:'ios',testEntry:'ios_folder1',expectedChecks:1,nativeOnly:true,mockOnly:false,paidCalls:0,kind:'device'};
const request={sourceSha,profileSha,nativePid,platform:'ios',nonce:'5317-1793240012345678',requiredFolderName:'NativeOutput-5317-1793240012345678',deadlineSeconds:180};
const packet=(key,x)=>key+':'+JSON.stringify(x);
function fixture(t,{mode='ok',now=Date.now}={}){
 const temp=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(temp,'ios-picker-observer-host-'));
 t.after(()=>{const r=fs.realpathSync(root);assert.equal(path.dirname(r),temp);assert(path.basename(r).startsWith('ios-picker-observer-host-'));fs.rmSync(r,{recursive:true});});
 const context={sourceSha,profileSha,appId:'com.codex.novelai.novelaiMobile',device:'ABCDE123-1234-1234-ABCD-123456ABCDEF',isolated:true,entry:'ios_folder1',root,products:root,testRun:'test.xctestrun',environment:{...process.env,UNIT_PRIVATE_TOKEN:'must-not-reach-ui'}};
 const calls=[];let pids=0;
 const execute=async(argv,opts)=>{
  calls.push({argv,timeout:opts.timeout,env:opts.env});let code;
  if(argv[0]==='xcrun'){
   pids++;assert(opts.timeout>0&&opts.timeout<=5000);
   const pid=mode==='wrong-before'&&pids===1||mode==='wrong-after'&&pids===2?nativePid+1:nativePid;
   code=mode==='timeout'?'setInterval(()=>{},1000)':`console.log(${JSON.stringify(pid+'\t0\tUIKitApplication:'+context.appId+'[abc]')})`;
   if(mode==='liveness'&&pids===1){const gate=path.join(root,'parent-loop-gate');setTimeout(()=>fs.writeFileSync(gate,'parent loop remained live'),30);code=`const fs=require('node:fs');const tick=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){clearInterval(tick);${code}}},5);`;}
  }else{
   assert.equal(argv[0],'xcodebuild');assert(opts.timeout>0&&opts.timeout<=140000);
   assert.equal(opts.env.UNIT_PRIVATE_TOKEN,undefined);assert.equal(opts.env.TEST_RUNNER_STUDIO_NONCE,request.nonce);
   const ui={sourceSha,profileSha,nativePid,nonce:request.nonce,requiredFolderName:request.requiredFolderName,appId:context.appId,actualSystemPicker:true,localProvider:'On My iPhone',createdExactNonceFolder:true,confirmedSelection:true,targetAppNotLaunchedOrTerminated:true,actions:['new-folder-via-system-picker','create-exact-nonce-folder','confirm-system-directory-selection'].map(action=>({action,label:'Synthetic host action, not actual picker',identifier:''}))};
   code=mode==='ui-error'?`console.error('original UI command error');process.exit(17)`:`console.log(${JSON.stringify(packet('IOS_FOLDER_PICKER_UI_RESULT',ui))})`;
  }
  const r=await runBoundedNativeCommand([process.execPath,'-e',code],{cwd:root,env:opts.env,timeout:mode==='timeout'?40:opts.timeout,killGrace:20,drainGrace:100});
  if(mode==='bad-cleanup')r.cleanupComplete=false;
  return r;
 };
 const observer=createIosFolderPickerObserver(context,{execute,now});observer.onLine(packet('FEATURE_ACCEPTANCE_BEGIN',begin));
 return{observer,root,calls};
}
test('async real PID child leaves parent event loop live and retains both PID bindings',async t=>{
 const {observer,calls,root}=fixture(t,{mode:'liveness'});await observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',request));const support=await observer.finish();
 assert.equal(support.supportOnly,true);assert.equal(support.functionalCertificationGranted,false);assert.equal(support.observedPidBefore,nativePid);assert.equal(support.observedPidAfter,nativePid);assert.equal(calls.length,3);assert.equal(calls[0].timeout,5000);assert(calls[1].timeout<=140000);assert(fs.existsSync(path.join(root,'PID_COMMAND_BEFORE.json')));assert(fs.existsSync(path.join(root,'PID_COMMAND_AFTER.json')));
});
for(const mode of ['wrong-before','timeout','bad-cleanup'])test('failed actual host PID boundary retains first error and never starts UI: '+mode,async t=>{
 const {observer,calls,root}=fixture(t,{mode});await assert.rejects(observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',request)),mode==='wrong-before'?/PID differs/:/picker command failed/);
 await assert.rejects(observer.finish(),e=>!e.message.includes('never observed'));
 assert.equal(calls.filter(c=>c.argv[0]==='xcodebuild').length,0);assert.equal(calls.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'OBSERVER_FAILURE.json'))).requestObserved,true);
});
for(const change of [{nonce:'foreign'},{sourceSha:'c'.repeat(40)},{profileSha:'d'.repeat(64)},{nativePid:99},{deadlineSeconds:181}])test('foreign request is rejected before any OS child: '+JSON.stringify(change),async t=>{
 const {observer,calls}=fixture(t);await assert.rejects(observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',{...request,...change})));await assert.rejects(observer.finish(),e=>!e.message.includes('never observed'));assert.equal(calls.length,0);
});
test('changed PID after synthetic UI remains failed and cannot write a success witness',async t=>{
 const {observer,calls,root}=fixture(t,{mode:'wrong-after'});await assert.rejects(observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',request)),/process changed/);await assert.rejects(observer.finish(),/process changed/);assert.equal(calls.length,3);assert(!fs.existsSync(path.join(root,'UI_RESULT.json')));
});
test('UI error is not converted into missing request or a successful support result',async t=>{
 const {observer,calls}=fixture(t,{mode:'ui-error'});await assert.rejects(observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',request)),/picker command failed.*17/);await assert.rejects(observer.finish(),/picker command failed.*17/);assert.equal(calls.length,2);
});
test('overall160s deadline is unchanged and exhausted budget launches no UI',async t=>{
 let reads=0;const {observer,calls}=fixture(t,{now:()=>++reads<3?0:160001});await assert.rejects(observer.onLine(packet('NATIVE_FOLDER_PICKER_REQUEST',request)),/deadline exceeded/);assert.equal(calls.length,1);assert.equal(calls[0].timeout,5000);
});
test('absent request is still a hard failure',async t=>{const {observer,calls}=fixture(t);await assert.rejects(observer.finish(),/never observed/);assert.equal(calls.length,0);});
test('runner preserves actual raw request and resident errors before picker finish',()=>{
 const source=fs.readFileSync(new URL('./run-mobile-native.mjs',import.meta.url),'utf8');assert(source.indexOf('emitNativeRaw();\n      try{')<source.indexOf('folderHostSupport=await picker.finish()'));assert(source.includes('...(resident?.errors||[])'));assert(source.includes('if (!parsed.passed || (resident && !resident.passed))'));
});
