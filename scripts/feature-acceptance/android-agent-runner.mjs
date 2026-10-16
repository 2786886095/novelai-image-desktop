import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {profileSha256} from './full-feature-profiles.mjs';
import {androidAgentTarget,androidAgentTestPackage,androidAgentRunner,assertAndroidAgentApks,assertAndroidAgentDevice,androidAgentScenarioReceipt} from './android-agent-contract.mjs';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export function parseAgentApkManifests(appBadging,testBadging,testXml){
 const packageName=text=>/package: name='([^']+)'/.exec(text)?.[1];
 const nativeAbis=(/native-code:\s*([^\r\n]+)/.exec(appBadging)?.[1].match(/'([^']+)'/g)||[]).map(x=>x.slice(1,-1));
 const block=/E: instrumentation\b([\s\S]*?)(?=\n\s*E:|$)/.exec(testXml)?.[1]||'';
 const attribute=name=>new RegExp(`android:${name}\\([^)]*\\)="([^"]+)"`).exec(block)?.[1];
 return {app:{packageName:packageName(appBadging),nativeAbis,debuggable:/^application-debuggable\s*$/m.test(appBadging),manifestVerified:true},
  test:{packageName:packageName(testBadging),runner:attribute('name'),targetPackage:attribute('targetPackage'),manifestVerified:true}};
}
export function parseAgentProc(status,stat,cmdline){
 const uid=Number(/^Uid:\s+(\d+)/m.exec(status)?.[1]);
 const tail=stat.slice(stat.lastIndexOf(') ')+2).trim().split(/\s+/);
 assert(Number.isSafeInteger(uid)&&uid>1);assert(tail.length>=20&&/^\d+$/.test(tail[19]));
 return {uid,startTimeTicks:tail[19],cmdline:cmdline.replaceAll('\0',' ')};
}
export async function runAndroidAgent(input){
 const projectRoot=path.resolve(input.projectRoot),output=path.resolve(input.outputRoot);
 assert(!output.startsWith(projectRoot+path.sep)&&output!==projectRoot,'Evidence must be outside source');
 fs.mkdirSync(output,{recursive:true});
 const ledger=[],hashFile=p=>hash(fs.readFileSync(p));let native,completed=false;
 fs.writeFileSync(path.join(output,'COMMANDS.json'),'[]\n');
 const record=entry=>{ledger.push(entry);fs.writeFileSync(path.join(output,'COMMANDS.json'),JSON.stringify(ledger,null,2)+'\n');return entry;};
 function command(argv,{timeout=120000,allowFailure=false}={}){
  const r=spawnSync(argv[0],argv.slice(1),{cwd:projectRoot,encoding:'utf8',timeout,maxBuffer:80*1024*1024,
   shell:process.platform==='win32'&&/\.(bat|cmd)$/i.test(argv[0]),env:{...process.env,STUDIO_NODE_BINARY:process.execPath}});
  const result=record({command:argv,cwd:projectRoot,stdout:r.stdout??'',stderr:r.stderr??'',exitStatus:r.status,error:r.error?.message??null,signal:r.signal??null});
  if(!allowFailure)assert(result.exitStatus===0&&!result.error,`Command failed: ${argv.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result;
 }
 const adb=(...args)=>command([input.adb,'-s',input.device,...args]);
 const write=(name,data)=>fs.writeFileSync(path.join(output,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');
 try{
  assert.equal(input.isolated,true);assert.equal(process.env.GITHUB_ACTIONS,'true','Device runner is restricted to disposable CI');
  assert(/^[a-f0-9]{40}$/.test(input.sourceSha));
  assert(/^emulator-\d+$/.test(input.device),'Physical devices forbidden before any adb mutation');
  const top=command(['git','rev-parse','--show-toplevel']).stdout.trim();assert.equal(fs.realpathSync(top),fs.realpathSync(projectRoot));
  assert.equal(command(['git','rev-parse','HEAD']).stdout.trim(),input.sourceSha);
  const clean=()=>assert.equal(command(['git','status','--porcelain','--untracked-files=normal']).stdout,'','Dirty/untracked source cannot qualify');clean();
  const device={serial:input.device,qemu:adb('shell','getprop','ro.kernel.qemu').stdout.trim(),boot:adb('shell','getprop','sys.boot_completed').stdout.trim(),
   abi:adb('shell','getprop','ro.product.cpu.abi').stdout.trim(),kernelArch:adb('shell','uname','-m').stdout.trim(),
   sdk:Number(adb('shell','getprop','ro.build.version.sdk').stdout.trim()),isolated:true,ci:true};assertAndroidAgentDevice(device);
  // Both APKs are built here from the same clean commit; no prebuilt/renamed input accepted.
  const build=command([input.gradle,'-p','mobile/android','-PstudioAgentQa','-Ptarget-platform=android-arm64','--no-daemon',':app:assembleDebug',':app:assembleDebugAndroidTest'],{timeout:1800000});clean();
  Object.assign(build,{sourceSha:input.sourceSha,cleanBefore:true,cleanAfter:true});
  const appPath=path.join(projectRoot,'mobile/build/app/outputs/apk/debug/app-debug.apk');
  const testPath=path.join(projectRoot,'mobile/build/app/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
  const manifests=parseAgentApkManifests(command([input.aapt,'dump','badging',appPath]).stdout,command([input.aapt,'dump','badging',testPath]).stdout,
   command([input.aapt,'dump','xmltree',testPath,'AndroidManifest.xml']).stdout);
  const apks={app:{...manifests.app,path:appPath,sha256:hashFile(appPath),bytes:fs.statSync(appPath).size},test:{...manifests.test,path:testPath,sha256:hashFile(testPath),bytes:fs.statSync(testPath).size}};
  assertAndroidAgentApks(apks.app,apks.test);write('APK_BINDINGS.json',apks);
  // Only exact QA IDs from verified APK manifests reach a mutating adb command.
  adb('shell','am','force-stop',androidAgentTarget);
  adb('install','-r','-t',appPath);adb('install','-r','-t',testPath);
  assert.equal(adb('shell','pm','clear',androidAgentTarget).stdout.trim(),'Success');
  if(device.sdk>=33)adb('shell','pm','grant',androidAgentTarget,'android.permission.POST_NOTIFICATIONS');
  const nonce=crypto.randomBytes(32).toString('hex');
  const argv=[input.adb,'-s',input.device,'shell','am','instrument','-w','-r',
   '-e','acceptance3','true','-e','isolated','true','-e','sourceSha',input.sourceSha,'-e','profileSha256',profileSha256,
   '-e','nonce',nonce,'-e','apkSha256',apks.app.sha256,'-e','testApkSha256',apks.test.sha256,androidAgentTestPackage+'/'+androidAgentRunner];
  let stdout='',stderr='',pending='',liveApp=null,liveSdk=null,eventError=null;
  const onLine=line=>{
   const match=/^(?:INSTRUMENTATION_STATUS: stream=)?ANDROID_AGENT_(BEGIN|SDK_BEGIN) (\{.*\})$/.exec(line);if(!match)return;
   const value=JSON.parse(match[2]);
   if(match[1]==='BEGIN'){
    assert.equal(liveApp,null,'Duplicate BEGIN');assert.equal(value.nonce,nonce);assert.equal(value.sourceSha,input.sourceSha);
    const pids=adb('shell','pidof',androidAgentTarget).stdout.trim().split(/\s+/).map(Number);
    assert(pids.includes(value.nativePid));const uid=Number(adb('shell','run-as',androidAgentTarget,'id','-u').stdout.trim());assert.equal(uid,value.uid);
    liveApp={pid:value.nativePid,uid,packageName:androidAgentTarget,observedWhileRunning:true};write('LIVE_APP.json',liveApp);
   }else{
    assert(liveApp);assert.equal(liveSdk,null);assert.equal(value.nonce,nonce);
    assert(Number.isSafeInteger(value.pid)&&value.pid>1&&value.pid!==liveApp.pid);
    const status=adb('shell','run-as',androidAgentTarget,'cat',`/proc/${value.pid}/status`).stdout;
    const stat=adb('shell','run-as',androidAgentTarget,'cat',`/proc/${value.pid}/stat`).stdout;
    const cmdline=adb('shell','run-as',androidAgentTarget,'cat',`/proc/${value.pid}/cmdline`).stdout;
    const proc=parseAgentProc(status,stat,cmdline);assert.equal(proc.uid,liveApp.uid);
    for(const k of ['uid','startTimeTicks','cmdline'])assert.equal(proc[k],value[k]);
    assert(proc.cmdline.includes('studio-sdk-driver.mjs'));
    liveSdk={pid:value.pid,...proc,observedWhileRunning:true,ackNonce:nonce};write('LIVE_SDK.json',liveSdk);
    // The first model response is held by the native loopback fixture until
    // this independent live /proc observation completes; no paid API involved.
    adb('shell','run-as',androidAgentTarget,'sh','-c',`printf %s ${nonce} > files/qa-sdk-ack-${nonce}`);
   }
  };
  const start=Date.now();let timedOut=false;
  const result=await new Promise((resolve,reject)=>{
   native=spawn(argv[0],argv.slice(1),{cwd:projectRoot,stdio:['ignore','pipe','pipe'],windowsHide:true});
   const timer=setTimeout(()=>{timedOut=true;native.kill();},1800000);
   native.stdout.on('data',chunk=>{stdout+=chunk;pending+=chunk;try{let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n).replace(/\r$/,'');pending=pending.slice(n+1);onLine(line);}}catch(error){eventError=error;native.kill();}});
   native.stderr.on('data',chunk=>{stderr+=chunk;});
   native.once('error',error=>{clearTimeout(timer);reject(error)});
   native.once('close',(exitStatus,signal)=>{clearTimeout(timer);resolve(record({command:argv,cwd:projectRoot,stdout,stderr,exitStatus,signal,durationMs:Date.now()-start,timedOut}));});
  });
  write('INSTRUMENTATION.stdout',stdout);write('INSTRUMENTATION.stderr',stderr);
  assert(!eventError,eventError?.stack);assert(!timedOut);assert.equal(result.exitStatus,0);assert(liveApp&&liveSdk);
  const nativeReportText=adb('exec-out','run-as',androidAgentTarget,'cat',`files/qa-agent-acceptance-${nonce}.json`).stdout;
  write('NATIVE_REPORT.json',nativeReportText);clean();
  const bundle={schema:'android-agent-controller/v1',platform:'android',sourceSha:input.sourceSha,profileSha256,sourceQualified:true,isolated:true,mockedModules:false,
   exitStatus:0,adb:input.adb,nonce,device,build,apks,instrumentation:result,liveApp,liveSdk,nativeReportText,nativeReportSha256:hash(nativeReportText)};
  const receipt=androidAgentScenarioReceipt(bundle,{sourceSha:input.sourceSha,profileSha256});
  write('controller-proof.json',bundle);write('android-agent-scenarios-receipt.json',receipt);completed=true;
  return {complete:true,nativeExecuted:true,sourceSha:input.sourceSha,scenarioCount:3,receipt:path.join(output,'android-agent-scenarios-receipt.json')};
 }catch(error){write('FAILURE.json',{complete:false,error:error.stack||String(error),nativePassClaimed:false});throw error;
 }finally{
  if(native?.exitCode===null)native.kill();
  // This exact QA package is the only process this controller may stop. Do
  // not stop a package if preflight/build failed before validated installation.
  if(ledger.some(x=>x.command[0]===input.adb&&x.command.includes('install')))
   command([input.adb,'-s',input.device,'shell','am','force-stop',androidAgentTarget],{allowFailure:true});
  write('RUN_STATUS.json',{complete:completed,nativePassClaimed:completed});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runAndroidAgent(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result));}
 catch(error){console.error(error.stack||error);process.exitCode=1;}
}
