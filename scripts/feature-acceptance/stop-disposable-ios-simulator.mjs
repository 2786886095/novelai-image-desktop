import fs from 'node:fs';import path from 'node:path';import {spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{iosSimulatorLocalePaths}from'./create-disposable-ios-simulator.mjs';
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s);
export function validateCreatedSimulatorReceipt(creation,device,sourceSha){
 if(!uuid(device)||!/^[a-f0-9]{40}$/.test(sourceSha||'')||creation?.sourceSha!==sourceSha||creation?.device!==device)throw Error('Cleanup source/created Simulator UUID differs');
 const type=creation.selection?.type?.identifier,runtime=creation.selection?.runtime?.identifier;
 if(!/^com\.apple\.CoreSimulator\.SimDeviceType\.[\w-]+$/.test(type||'')||!/^com\.apple\.CoreSimulator\.SimRuntime\.iOS-[\d-]+$/.test(runtime||''))throw Error('Created Simulator type/runtime proof missing');
 const creates=creation.commands?.filter(c=>Array.isArray(c.command)&&c.command[0]==='xcrun'&&c.command[1]==='simctl'&&c.command[2]==='create');
 const expected=['xcrun','simctl','create','Disposable Feature Acceptance',type,runtime];
 if(!Array.isArray(creates)||creates.length!==1||JSON.stringify(creates[0].command)!==JSON.stringify(expected)||creates[0].exitStatus!==0||creates[0].error!==null||creates[0].stdout?.trim()!==device)throw Error('Exactly one successful own Simulator creation required');
 return{device,type,runtime};
}
export function createdSimulatorState(inventory,identity){
 if(!inventory?.devices||typeof inventory.devices!=='object')throw Error('Actual Simulator inventory required');
 const matches=Object.entries(inventory.devices).flatMap(([runtime,items])=>{if(!Array.isArray(items))throw Error('Malformed Simulator inventory');return items.filter(d=>d?.udid===identity.device).map(device=>({runtime,device}));});
 if(matches.length!==1)throw Error('Exactly one actual newly created Simulator required');
 const {runtime,device}=matches[0];
 if(runtime!==identity.runtime||device.deviceTypeIdentifier!==identity.type||device.name!=='Disposable Feature Acceptance')throw Error('Actual Simulator ownership metadata differs');
 iosSimulatorLocalePaths(device.dataPath,identity.device);
 if(!['Booted','Shutdown'].includes(device.state))throw Error('Unknown or transitional actual Simulator state: '+device.state);
 return device.state;
}
export function stopCreatedSimulator({creation,device,sourceSha,command}){
 const identity=validateCreatedSimulatorReceipt(creation,device,sourceSha);
 const read=()=>createdSimulatorState(JSON.parse(command(['xcrun','simctl','list','devices','--json'])),identity);
 const initialState=read();let shutdownIssued=false;
 if(initialState==='Booted'){command(['xcrun','simctl','shutdown',device]);shutdownIssued=true;}
 // Even an already-Shutdown device is independently observed again. Never
 // swallow simctl failures or issue shutdown to another user's Simulator.
 const finalState=read();if(finalState!=='Shutdown')throw Error('Own Simulator did not become Shutdown');
 return{device,initialState,finalState,shutdownIssued,functionalCertificationGranted:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let out=null;const commands=[];let result=null,exitStatus=1,failure=null;
 const command=argv=>{const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8',timeout:60000,maxBuffer:20*1024*1024});commands.push({command:argv,stdout:r.stdout??'',stderr:r.stderr??'',exitStatus:r.status,signal:r.signal??null,error:r.error?.message??null});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.status!==0||r.error||r.signal)throw Error('Native cleanup command failed: '+JSON.stringify(argv));return r.stdout;};
 try{
  if(process.argv.length!==2||process.platform!=='darwin'||process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP)throw Error('Only the explicit own fresh macOS CI Simulator may be cleaned up');
  out=path.join(process.env.RUNNER_TEMP,'feature-native-ios','simulator');
  const creation=JSON.parse(fs.readFileSync(path.join(out,'SIMULATOR_CREATION.json'),'utf8'));
  if(command(['git','rev-parse','HEAD']).trim()!==process.env.GITHUB_SHA)throw Error('Cleanup checkout SHA mismatch');
  result=stopCreatedSimulator({creation,device:process.env.FEATURE_SIMULATOR,sourceSha:process.env.GITHUB_SHA,command});exitStatus=0;
 }catch(error){failure=String(error.stack||error);process.stderr.write(failure+'\n');}
 finally{if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'SIMULATOR_CLEANUP.json'),JSON.stringify({sourceSha:process.env.GITHUB_SHA,device:process.env.FEATURE_SIMULATOR,commands,result,exitStatus,failure,functionalCertificationGranted:false,paidCalls:0},null,2)+'\n');process.exitCode=exitStatus;}
}
