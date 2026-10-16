// CI-only OS UI driver, not an acceptance receipt. Product Dart must separately
// observe the actual chosen external path, permissions, bytes and fresh history.
// Android 14 DocumentsUI IDs are from AOSP fragment_pick/navigation_breadcrumb_item.
import crypto from 'node:crypto';

const pickerPackage=p=>['com.android.documentsui','com.google.android.documentsui'].includes(p);
const sha256=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
export function hierarchyNodes(xml){
 if(typeof xml!=='string'||!/<hierarchy\b/.test(xml)||!/<\/hierarchy>/.test(xml))throw Error('Fresh native hierarchy required');
 const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(([raw])=>Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)])));
 if(!nodes.length)throw Error('Empty native hierarchy');
 return nodes;
}
const point=n=>{
 const m=/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(n.bounds||'');
 if(!m||+m[3]<=+m[1]||+m[4]<=+m[2]||+m[3]>16384||+m[4]>16384)throw Error('Observed target bounds invalid');
 if(n.enabled!=='true')throw Error('Observed target is disabled');
 return [Math.floor((+m[1]+ +m[3])/2),Math.floor((+m[2]+ +m[4])/2)];
};
export function validateFolderRequest({request:r,begin:b,sourceSha,profileSha,nativePid,device,appId,isolated,entry}){
 if(isolated!==true||entry!=='android_folder1'||!/^emulator-\d+$/.test(device||'')||!/^[a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+$/.test(appId||''))throw Error('Explicit isolated folder entry/emulator/package required');
 if(!/^[a-f0-9]{40}$/.test(sourceSha||'')||!/^[a-f0-9]{64}$/.test(profileSha||'')||!Number.isSafeInteger(nativePid)||nativePid<1||nativePid>2147483647)throw Error('Actual source/profile/PID required');
 if(!b||b.sourceSha!==sourceSha||b.profileSha!==profileSha||b.platform!=='android'||b.nativePid!==nativePid||b.testEntry!==entry||b.expectedChecks!==1||b.nativeOnly!==true||b.mockOnly!==false||b.paidCalls!==0||b.kind!=='device')throw Error('Folder request lacks matching real native BEGIN');
 if(!r||r.sourceSha!==sourceSha||r.profileSha!==profileSha||r.platform!=='android'||r.nativePid!==nativePid||!new RegExp(`^${nativePid}-[1-9][0-9]{10,19}$`).test(r.nonce||'')||r.requiredFolderName!==`NativeOutput-${r.nonce}`||r.deadlineSeconds!==180)throw Error('Foreign, unbounded or malformed folder request');
 return `/sdcard/Documents/${r.requiredFolderName}`;
}
export function folderPacket(logs){
 const packets=[...String(logs).matchAll(/NATIVE_FOLDER_PICKER_REQUEST:(\{[^\r\n]*\})/g)].map(m=>JSON.parse(m[1]));
 const unique=[...new Set(packets.map(p=>JSON.stringify(p)))];
 if(unique.length>1)throw Error('Multiple distinct folder requests');
 return unique.length?JSON.parse(unique[0]):null;
}
export function folderUiAction(xml,{folderName,appId,deviceModel},state){
 const nodes=hierarchyNodes(xml),text=nodes.map(n=>n.text||'').join('\n');
 if(/isn['’]t responding|is not responding|keeps stopping/i.test(text))throw Error('Unhealthy OS/application dialog during folder selection');
 const packages=new Set(nodes.map(n=>n.package).filter(Boolean));
 if([...packages].some(p=>!pickerPackage(p)&&![appId,'com.android.settings','com.android.systemui','android'].includes(p)))throw Error('Unexpected foreground package in folder driver');
 const find=(predicate)=>nodes.find(n=>n.enabled==='true'&&predicate(n));
 const tap=(kind,n)=>({kind,tap:point(n)});
 if(nodes.some(n=>pickerPackage(n.package))){
  const pick=n=>pickerPackage(n.package);
  // Never select the tree while the nonce is merely a file-list row. The
  // actual breadcrumb must identify the already opened nonce folder first.
  const inFolder=nodes.some(n=>pick(n)&&n['resource-id']===`${n.package}:id/breadcrumb_text`&&n.text===folderName);
  if(inFolder){
   state.folderObserved=true;
   const use=find(n=>pick(n)&&n['resource-id']==='android:id/button1'&&/^Use this folder$/i.test(n.text||''));
   if(use){state.useTapped=true;return tap('use-observed-nonce-folder',use);}
  }
  if(state.useTapped&&text.includes(folderName)){
   const allow=find(n=>n['resource-id']==='android:id/button1'&&/^Allow$/i.test(n.text||''));
   if(allow){state.allowTapped=true;return tap('confirm-observed-folder-grant',allow);}
  }
  if(!state.useTapped){
   const folder=find(n=>pick(n)&&n['resource-id']==='android:id/title'&&n.text===folderName);
   if(folder)return tap('open-nonce-folder',folder);
   const docs=find(n=>pick(n)&&n['resource-id']==='android:id/title'&&n.text==='Documents');
   if(docs)return tap('open-documents',docs);
   if(state.drawerOpened){
    const root=find(n=>pick(n)&&n['resource-id']==='android:id/title'&&[deviceModel,'Internal storage','Internal shared storage'].filter(Boolean).includes(n.text));
    if(root){state.drawerOpened=false;return tap('open-observed-device-storage',root);}
   }else{
    const drawer=find(n=>pick(n)&&/^(Show roots|Open navigation drawer)$/i.test(n['content-desc']||''));
    if(drawer){state.drawerOpened=true;return tap('open-observed-roots-drawer',drawer);}
   }
  }
  return {kind:'wait-picker-transition'};
 }
 if(nodes.some(n=>n.package==='com.android.settings')){
  if(!state.useTapped)throw Error('Permission settings appeared before real folder selection');
  if(!/Allow access to manage all files/i.test(text))throw Error('Unrecognized Android settings page');
  const sw=find(n=>n.package==='com.android.settings'&&['android:id/switch_widget','com.android.settings:id/switch_widget'].includes(n['resource-id'])&&n.class==='android.widget.Switch');
  if(!sw)return {kind:'wait-permission-switch'};
  if(sw.checked==='false'){state.permissionTapped=true;return tap('enable-observed-all-files-permission',sw);}
  if(sw.checked!=='true')throw Error('Unknown permission switch state');
  state.permissionObserved=true;return {kind:'return-from-observed-permission',key:'KEYCODE_BACK'};
 }
 if(state.useTapped&&nodes.some(n=>n.package===appId)){
  // The native Dart journey taps its real Flutter Authorize dialog. Host code
  // does not substitute a platform result or use appops/pm to grant access.
  if(state.permissionObserved)return {kind:'returned-to-native-client',done:true};
  return {kind:'wait-client-permission-dialog'};
 }
 return {kind:'wait-real-picker'};
}
export async function driveAndroidFolderPicker(options){
 const {adb,device,appId,command,request,phase=()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,environment=process.env}=options;
 if(environment.GITHUB_ACTIONS!=='true')throw Error('Folder UI automation is restricted to disposable CI');
 const externalPath=validateFolderRequest(options);
 const run=args=>{const r=command([adb,'-s',device,...args],undefined,20000);if(r.exitStatus!==0||r.error)throw Error(`OS folder driver command failed: ${JSON.stringify(args)} exit=${r.exitStatus} ${r.error||''}`);return r.stdout.trim();};
 if(run(['shell','getprop','ro.kernel.qemu'])!=='1'||run(['shell','getprop','sys.boot_completed'])!=='1')throw Error('Actual booted disposable emulator required');
 if(run(['shell','pidof',appId])!==String(options.nativePid))throw Error('Native process changed before folder driver');
 const deviceModel=run(['shell','getprop','ro.product.model']);
 // No caller-supplied arbitrary path, recursive removal, model download or
 // application preference write. This fixture is outside the app sandbox.
 run(['shell','mkdir','-p',externalPath]);
 const state={},deadline=now()+160000;
 const dump=`/data/local/tmp/folder-${request.nonce}.xml`;
 let poll=0;
 while(now()<deadline&&poll++<160){
  if(run(['shell','pidof',appId])!==String(options.nativePid))throw Error('Native app exited/restarted during folder UI');
  const result=run(['shell','uiautomator','dump',dump]);
  if(!result.includes(`dumped to: ${dump}`))throw Error('UI dump did not confirm fresh hierarchy');
  const xml=run(['shell','cat',dump]);
  const action=folderUiAction(xml,{folderName:request.requiredFolderName,appId,deviceModel},state);
  phase({stage:'folder-picker-ui',poll,action,xml,xmlSha256:sha256(xml),externalPath,nativePid:options.nativePid});
  if(action.kind==='wait-client-permission-dialog'){
   const access=run(['shell','cmd','appops','get',appId,'MANAGE_EXTERNAL_STORAGE']);
   if(/MANAGE_EXTERNAL_STORAGE:\s*allow\b/.test(access)){
    state.permissionObserved=true;
    phase({stage:'folder-permission-read-only',stdout:access,nativePid:options.nativePid});
    return {externalPath,state,scope:'Real OS selection/permission observed; native Dart assertions still required'};
   }
  }
  if(action.tap)run(['shell','input','tap',...action.tap.map(String)]);
  if(action.key)run(['shell','input','keyevent',action.key]);
  if(action.done)return {externalPath,state,scope:'OS interactions observed; no native feature pass inferred'};
  await sleep(750);
 }
 throw Error('Real native folder picker/permission interaction timed out; no fallback or pass');
}
