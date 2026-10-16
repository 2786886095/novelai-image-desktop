import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runAndroidAgent} from '../../../scripts/feature-acceptance/android-agent-runner.mjs';

/** Disposable ARM64 image provisioning, not a runtime-build substitution. It
 * deliberately fails on an unsupported host/image/hypervisor; no x86 fallback. */
export async function provisionAndroidAgent(input){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Only disposable CI may provision a device');
 assert.equal(input.isolated,true);assert.equal(process.arch,'arm64','A native ARM64 CI host is required');
 assert(['darwin','linux'].includes(process.platform));
 const output=path.resolve(input.outputRoot),project=path.resolve(input.projectRoot);
 assert(output!==project&&!output.startsWith(project+path.sep));fs.mkdirSync(output,{recursive:true});
 const avdHome=path.join(output,'disposable-avds');assert(!fs.existsSync(avdHome),'Fresh AVD home required');fs.mkdirSync(avdHome);
 const userHome=path.join(output,'android-user');fs.mkdirSync(userHome);
 const env={...process.env,ANDROID_AVD_HOME:avdHome,ANDROID_USER_HOME:userHome,ANDROID_SDK_ROOT:input.androidSdk,ANDROID_HOME:input.androidSdk};
 const ledger=[];let emulator;
 const run=(argv,timeout=120000,stdin)=>{
  const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',timeout,input:stdin,env,maxBuffer:16*1024*1024});
  const e={command:argv,stdout:r.stdout||'',stderr:r.stderr||'',exitStatus:r.status,error:r.error?.message||null};ledger.push(e);
  fs.writeFileSync(path.join(output,'PROVISION_COMMANDS.json'),JSON.stringify(ledger,null,2)+'\n');
  assert(e.exitStatus===0&&!e.error,JSON.stringify(e));return e.stdout;
 };
 const sdk=path.resolve(input.androidSdk),adb=path.join(sdk,'platform-tools','adb'),emulatorBin=path.join(sdk,'emulator','emulator');
 const sdkmanager=path.join(sdk,'cmdline-tools','latest','bin','sdkmanager'),avdmanager=path.join(sdk,'cmdline-tools','latest','bin','avdmanager');
 const image='system-images;android-34;google_apis;arm64-v8a';
 const port=input.emulatorPort??5580;assert(Number.isInteger(port)&&port>=5554&&port<=5680&&port%2===0);
 const serial='emulator-'+port,name='studio_agent_'+crypto.randomBytes(8).toString('hex');
 try{
  run([sdkmanager,`--sdk_root=${sdk}`,'platform-tools','emulator',image],900000);
  run([emulatorBin,'-accel-check']);
  assert(!run([adb,'devices','-l']).split(/\r?\n/).some(line=>line.startsWith(serial+'\t')),'AVD port already belongs to another device');
  run([avdmanager,'create','avd','--name',name,'--package',image,'--abi','arm64-v8a'],120000,'no\n');
  const ini=path.join(avdHome,name+'.ini'),config=path.join(avdHome,name+'.avd','config.ini');
  assert(fs.existsSync(ini)&&fs.existsSync(config));assert(fs.readFileSync(config,'utf8').includes('abi.type=arm64-v8a'));
  const stdout=fs.openSync(path.join(output,'EMULATOR.stdout'),'wx'),stderr=fs.openSync(path.join(output,'EMULATOR.stderr'),'wx');
  const argv=[emulatorBin,'-avd',name,'-port',String(port),'-no-window','-no-audio','-no-boot-anim','-no-snapshot','-no-snapshot-save','-wipe-data','-gpu','swiftshader_indirect'];
  emulator=spawn(argv[0],argv.slice(1),{env,stdio:['ignore',stdout,stderr]});fs.closeSync(stdout);fs.closeSync(stderr);
  emulator.on('error',error=>fs.writeFileSync(path.join(output,'EMULATOR_START_ERROR.txt'),String(error)));
  fs.writeFileSync(path.join(output,'EMULATOR_START.json'),JSON.stringify({command:argv,pid:emulator.pid,avdHome,userHome,image,serial,hostArch:process.arch,hostPlatform:process.platform},null,2));
  run([adb,'-s',serial,'wait-for-device'],180000);
  const end=Date.now()+180000;
  while(Date.now()<end){assert(emulator.exitCode===null,'ARM64 emulator exited before boot');const r=run([adb,'-s',serial,'shell','getprop','sys.boot_completed']);if(r.trim()==='1')break;await new Promise(r=>setTimeout(r,1000));}
  assert.equal(run([adb,'-s',serial,'shell','getprop','sys.boot_completed']).trim(),'1');
  return await runAndroidAgent({...input,adb,device:serial,outputRoot:path.join(output,'native-agent3')});
 }finally{
  if(emulator?.pid&&emulator.exitCode===null){
   // Only our newly created AVD's exact serial is stopped, never a discovered phone.
   spawnSync(adb,['-s',serial,'emu','kill'],{env,encoding:'utf8',timeout:30000});
   if(emulator.exitCode===null)emulator.kill();
  }
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await provisionAndroidAgent(JSON.parse(fs.readFileSync(process.argv[2],'utf8')))));}
 catch(error){console.error(error.stack||error);process.exitCode=1;}
}
