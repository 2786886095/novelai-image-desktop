import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const versionNumber=value=>{
 const p=String(value).split('.').map(Number);
 if(p.some(x=>!Number.isInteger(x)||x<0||x>255))throw Error('Invalid runtime version');
 return (p[0]*65536)+(p[1]||0)*256+(p[2]||0);
};
export function iosSimulatorLocalePaths(dataPath,device){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(device||'')||typeof dataPath!=='string'||!path.posix.isAbsolute(dataPath)||dataPath.includes('\\'))throw Error('Actual newly created Simulator data path/UUID required');
 const clean=path.posix.normalize(dataPath);if(clean!==dataPath||!clean.toLowerCase().endsWith('/library/developer/coresimulator/devices/'+device.toLowerCase()+'/data'))throw Error('Locale writes must be confined to the freshly created Simulator');
 const domain=clean+'/Library/Preferences/.GlobalPreferences';return{dataPath:clean,domain,file:domain+'.plist',languages:['en'],locale:'en_US',testLanguage:'en',testRegion:'US'};
}
export function chooseIOSSimulatorTarget(runtimes,deviceTypes,devices={}){
 const available=runtimes.filter(r=>r.isAvailable&&/^iOS(?: |$)/.test(r.name)).sort((a,b)=>versionNumber(b.version)-versionNumber(a.version));
 for(const runtime of available){
  const v=versionNumber(runtime.version), existing=devices[runtime.identifier]||[];
  const compatible=deviceTypes.filter(t=>t.productFamily==='iPhone'||t.name?.startsWith('iPhone')).filter(t=>{
   const range=Number.isFinite(t.minRuntimeVersion)&&Number.isFinite(t.maxRuntimeVersion)&&v>=t.minRuntimeVersion&&v<=t.maxRuntimeVersion;
   const nativeInventory=existing.some(d=>d.isAvailable&&d.deviceTypeIdentifier===t.identifier);
   return range||nativeInventory;
  }).sort((a,b)=>(b.minRuntimeVersion||0)-(a.minRuntimeVersion||0)||(a.identifier<b.identifier?-1:1));
  if(compatible.length)return {runtime,type:compatible[0],compatibilityEvidence:Number.isFinite(compatible[0].minRuntimeVersion)&&Number.isFinite(compatible[0].maxRuntimeVersion)?'native device-type runtime range':'available native device in this exact runtime'};
 }
 throw Error('No iPhone type with confirmed compatibility for an installed available iOS runtime.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=path.join(process.env.RUNNER_TEMP||'', 'feature-native-ios','simulator');fs.mkdirSync(output,{recursive:true});
 const commands=[];let selection,device,locale,exitStatus=1,failure;
 function run(argv){const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',timeout:240000,maxBuffer:20*1024*1024});commands.push({command:argv,stdout:r.stdout??'',stderr:r.stderr??'',exitStatus:r.status,error:r.error?.message??null});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.status!==0)throw Error(`Native command failed: ${argv.join(' ')}`);return r.stdout;}
 try{
  if(process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP||!process.env.GITHUB_ENV)throw Error('Only a fresh macOS GitHub runner may create this disposable Simulator.');
  if(run(['git','rev-parse','HEAD']).trim()!==process.env.GITHUB_SHA)throw Error('Checkout SHA mismatch');
  const runtimes=JSON.parse(run(['xcrun','simctl','list','runtimes','--json'])).runtimes;
  const types=JSON.parse(run(['xcrun','simctl','list','devicetypes','--json'])).devicetypes;
  const devices=JSON.parse(run(['xcrun','simctl','list','devices','available','--json'])).devices;
  selection=chooseIOSSimulatorTarget(runtimes,types,devices);
  device=run(['xcrun','simctl','create','Disposable Feature Acceptance',selection.type.identifier,selection.runtime.identifier]).trim();
  if(!/^[a-f0-9-]{36}$/i.test(device))throw Error('Invalid newly created Simulator UUID');
  // Publish only OUR newly created UUID before boot, so workflow cleanup also runs after boot failure.
  fs.appendFileSync(process.env.GITHUB_ENV,`FEATURE_SIMULATOR=${device}\n`);
  // Only this newly created, not-yet-booted Simulator receives deterministic
  // system locale preferences. Product AppState language is not an OS locale.
  const created=Object.values(JSON.parse(run(['xcrun','simctl','list','devices','--json'])).devices).flat().filter(d=>d.udid===device);
  if(created.length!==1||created[0].state!=='Shutdown')throw Error('Locale requires the unique newly created shutdown Simulator');
  locale=iosSimulatorLocalePaths(created[0].dataPath,device);
  fs.mkdirSync(path.dirname(locale.file),{recursive:true});
  for(let p=path.dirname(locale.file);;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())throw Error('Aliased Simulator preferences refused');if(p===path.parse(p).root)break;}
  if(fs.existsSync(locale.file)&&(!fs.lstatSync(locale.file).isFile()||fs.lstatSync(locale.file).isSymbolicLink()))throw Error('Nonregular Simulator preference file refused');
  run(['/usr/bin/defaults','write',locale.domain,'AppleLanguages','-array','en']);run(['/usr/bin/defaults','write',locale.domain,'AppleLocale','-string','en_US']);
  const languages=JSON.parse(run(['/usr/bin/plutil','-extract','AppleLanguages','json','-o','-',locale.file]));const region=run(['/usr/bin/plutil','-extract','AppleLocale','raw','-o','-',locale.file]).trim();
  if(JSON.stringify(languages)!=='["en"]'||region!=='en_US')throw Error('Actual Simulator locale readback differs');
  run(['xcrun','simctl','boot',device]);run(['xcrun','simctl','bootstatus',device,'-b']);exitStatus=0;
 }catch(error){failure=String(error.stack||error);process.stderr.write(failure+'\n');}
 finally{fs.writeFileSync(path.join(output,'SIMULATOR_CREATION.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,selection,device,locale,commands,exitStatus,failure:failure??null,paidCalls:0,full195Certified:false},null,2)+'\n');process.exitCode=exitStatus;}
}
