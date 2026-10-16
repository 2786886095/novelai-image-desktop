// Injected XML/commands below are host policy fixtures, NEVER native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hierarchyNodes,validateFolderRequest,folderPacket,folderUiAction,driveAndroidFolderPicker} from './android-folder-picker-driver.mjs';
const sourceSha='a'.repeat(40),profileSha='b'.repeat(64),nativePid=1234;
const nonce='1234-1792190000000000',folderName=`NativeOutput-${nonce}`,appId='com.example.isolated';
const request={sourceSha,profileSha,nativePid,platform:'android',nonce,requiredFolderName:folderName,deadlineSeconds:180};
const begin={sourceSha,profileSha,nativePid,platform:'android',testEntry:'android_folder1',expectedChecks:1,nativeOnly:true,mockOnly:false,paidCalls:0,kind:'device'};
const options={request,begin,sourceSha,profileSha,nativePid,device:'emulator-5554',appId,isolated:true,entry:'android_folder1'};
const pkg='com.android.documentsui';
const node=(text,id='android:id/title',extra={})=>({'text':text,'resource-id':id,package:pkg,enabled:'true',bounds:'[10,20][110,60]',...extra});
const xml=(...nodes)=>`<hierarchy>${nodes.map(n=>'<node '+Object.entries(n).map(([k,v])=>`${k}="${String(v).replaceAll('&','&amp;').replaceAll('"','&quot;')}"`).join(' ')+'/>').join('')}</hierarchy>`;
const policy=(tree,state={})=>folderUiAction(tree,{folderName,appId,deviceModel:'sdk_gphone64_x86_64'},state);
test('strict native packet binds source/profile/PID/nonce/fixed entry and external path',()=>{
 assert.equal(validateFolderRequest(options),`/sdcard/Documents/${folderName}`);
 for(const patch of [{isolated:false},{entry:'ios_update2'},{device:'physical1'},{nativePid:0},{sourceSha:'uncommitted'},{appId:'bad;echo'}])assert.throws(()=>validateFolderRequest({...options,...patch}));
 for(const patch of [{platform:'ios'},{nativePid:4321},{sourceSha:'c'.repeat(40)},{profileSha:'c'.repeat(64)},{nonce:'1234-../escape'},{requiredFolderName:'arbitrary'},{deadlineSeconds:999}])assert.throws(()=>validateFolderRequest({...options,request:{...request,...patch}}));
 for(const patch of [{mockOnly:true},{nativeOnly:false},{paidCalls:1},{nativePid:1235},{testEntry:'os6'},{expectedChecks:2}])assert.throws(()=>validateFolderRequest({...options,begin:{...begin,...patch}}));
});
test('log packet extraction accepts repeats but rejects distinct requests or invalid JSON',()=>{
 const s='NATIVE_FOLDER_PICKER_REQUEST:'+JSON.stringify(request);
 assert.deepEqual(folderPacket(`${s}\n${s}`),request);assert.equal(folderPacket('no request'),null);
 assert.throws(()=>folderPacket(s+'\nNATIVE_FOLDER_PICKER_REQUEST:'+JSON.stringify({...request,nonce:'x'})),/Multiple/);
 assert.throws(()=>folderPacket('NATIVE_FOLDER_PICKER_REQUEST:{bad}'));
});
test('nonce row cannot authorize parent tree; actual breadcrumb required',()=>{
 const state={};const row=xml(node(folderName),node('Use this folder','android:id/button1'));
 assert.equal(policy(row,state).kind,'open-nonce-folder');assert.equal(state.useTapped,undefined);
 const opened=xml(node(folderName,`${pkg}:id/breadcrumb_text`),node('Use this folder','android:id/button1'));
 assert.equal(policy(opened,state).kind,'use-observed-nonce-folder');assert.equal(state.folderObserved,true);
 assert.equal(policy(xml(node(`Allow access to ${folderName}?`),node('Allow','android:id/button1')),state).kind,'confirm-observed-folder-grant');
});
test('permission UI is actual observed switch, not appops mutation',()=>{
 const settings=checked=>xml(node('Allow access to manage all files','android:id/title',{package:'com.android.settings'}),node('','android:id/switch_widget',{package:'com.android.settings',class:'android.widget.Switch',checked}));
 assert.throws(()=>policy(settings('false'),{}),/before real folder/);
 const state={useTapped:true};assert.deepEqual(policy(settings('false'),state).tap,[60,40]);
 assert.equal(policy(settings('true'),state).key,'KEYCODE_BACK');assert.equal(state.permissionObserved,true);
 assert.equal(policy(xml(node('client','',{package:appId})),state).done,true);
});
test('driver fails closed for unhealthy/foreign/invalid native hierarchy or target',()=>{
 assert.throws(()=>hierarchyNodes('<hierarchy/>'),/Fresh/);
 assert.throws(()=>policy(xml(node('App is not responding'))),/Unhealthy/);
 assert.throws(()=>policy(xml(node('Documents','android:id/title',{package:'other.app'}))),/Unexpected/);
 assert.throws(()=>policy(xml(node('Documents','android:id/title',{bounds:'[0,0][0,0]'}))),/bounds/);
 assert.equal(policy(xml(node('Documents','android:id/title',{enabled:'false'}))).kind,'wait-picker-transition');
});
function fixture({qemu='1',pid=String(nativePid),permissionAlready=false}={}){
 const commands=[],phases=[];
 const trees=[xml(node('Documents')),xml(node(folderName)),xml(node(folderName,`${pkg}:id/breadcrumb_text`),node('Use this folder','android:id/button1')),xml(node(`Allow access to ${folderName}?`),node('Allow','android:id/button1'))];
 if(!permissionAlready){trees.push(xml(node('Allow access to manage all files','android:id/title',{package:'com.android.settings'}),node('','android:id/switch_widget',{package:'com.android.settings',class:'android.widget.Switch',checked:'false'})),xml(node('Allow access to manage all files','android:id/title',{package:'com.android.settings'}),node('','android:id/switch_widget',{package:'com.android.settings',class:'android.widget.Switch',checked:'true'})));}
 trees.push(xml(node('client','',{package:appId})));
 let at=0,now=0;
 const command=argv=>{
  commands.push(argv);const args=argv.slice(3),s=args.join(' ');let stdout='';
  if(s==='shell getprop ro.kernel.qemu')stdout=qemu;
  else if(s==='shell getprop sys.boot_completed')stdout='1';
  else if(s===`shell pidof ${appId}`)stdout=pid;
  else if(s==='shell getprop ro.product.model')stdout='sdk_gphone64_x86_64';
  else if(s.startsWith('shell uiautomator dump '))stdout='UI hierchary dumped to: '+args.at(-1);
  else if(s.startsWith('shell cat '))stdout=trees[Math.min(at++,trees.length-1)];
  else if(s.startsWith('shell cmd appops get '))stdout=permissionAlready?'MANAGE_EXTERNAL_STORAGE: allow':'MANAGE_EXTERNAL_STORAGE: default';
  else assert(s.startsWith('shell mkdir -p /sdcard/Documents/NativeOutput-')||s.startsWith('shell input tap ')||s==='shell input keyevent KEYCODE_BACK','unexpected simulated command '+s);
  return {stdout,stderr:'',exitStatus:0};
 };
 return {commands,phases,config:{...options,adb:'adb',environment:{GITHUB_ACTIONS:'true'},command,phase:p=>phases.push(p),now:()=>now,sleep:async ms=>{now+=ms;}}};
}
test('simulated host command loop records observed XML/real actions but no acceptance CHECK',async()=>{
 const f=fixture(),r=await driveAndroidFolderPicker(f.config);assert.equal(r.state.permissionObserved,true);
 assert.equal(f.phases.filter(p=>p.action?.tap).length,5);
 assert(f.phases.every(p=>!JSON.stringify(p).includes('FEATURE_ACCEPTANCE_CHECK')));
 assert(!f.commands.some(a=>/\b(appops set|pm grant|am start)\b/.test(a.join(' '))));
});
test('read-only actual permission inspection permits preexisting granted access',async()=>{
 const f=fixture({permissionAlready:true}),r=await driveAndroidFolderPicker(f.config);assert.equal(r.state.permissionObserved,true);assert(f.commands.some(a=>a.includes('appops')));
});
test('no OS command outside explicit CI/booted disposable same-PID constraints',async()=>{
 const f=fixture();await assert.rejects(()=>driveAndroidFolderPicker({...f.config,environment:{}}),/CI/);assert.equal(f.commands.length,0);
 await assert.rejects(()=>driveAndroidFolderPicker(fixture({qemu:'0'}).config),/booted disposable/);
 await assert.rejects(()=>driveAndroidFolderPicker(fixture({pid:'999'}).config),/process changed/);
});
test('same observed disabled screen times out, never self-certifies or retries assertions',async()=>{
 const f=fixture();f.config.now=(()=>{let t=0;return()=>t+=80000;})();await assert.rejects(()=>driveAndroidFolderPicker(f.config),/timed out/);
});
