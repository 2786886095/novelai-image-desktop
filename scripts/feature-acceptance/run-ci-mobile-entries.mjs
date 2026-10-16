import {mobileNativeEntries,isMobileScenarioEntry,selectMobileNativeEntries} from './mobile-entry-specs.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createEntryWorkspace,captureSourceState} from './mobile-entry-workspace.mjs';
import {buildMobileScenarioReceipt} from './mobile-scenario-receipt.mjs';
const platform=process.argv[2],device=process.argv[3];
const entryGroup=process.argv[4]??'all',selectedEntries=selectMobileNativeEntries(entryGroup,platform);
if(process.env.GITHUB_ACTIONS!=='true'||!['android','ios'].includes(platform)||!device||!process.env.RUNNER_TEMP)throw Error('Fresh CI mobile target required.');
const root=path.join(process.env.RUNNER_TEMP,`feature-native-${platform}`);fs.mkdirSync(root,{recursive:true});
const commands=[],entries=[];let failed=false;
// Independent CI policy, never inferred from an application's DONE self-report.
const expectedChecks=Object.fromEntries(Object.entries(mobileNativeEntries).map(([id,spec])=>[id,spec.expectedChecks]));
function run(sourceRoot,args,timeout=2100000){
 const argv=[process.execPath,...args];const r=spawnSync(argv[0],argv.slice(1),{cwd:sourceRoot,encoding:'utf8',timeout,maxBuffer:100*1024*1024,env:{...process.env,STUDIO_NODE_BINARY:process.execPath}});
 const row={command:argv,cwd:sourceRoot,stdout:r.stdout??'',stderr:r.stderr??'',exitStatus:r.status,signal:r.signal,error:r.error?.message??null};commands.push(row);process.stdout.write(row.stdout);process.stderr.write(row.stderr);return r.status===0&&!r.error;
}
const sha=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});commands.push({command:['git','rev-parse','HEAD'],stdout:sha.stdout??'',stderr:sha.stderr??'',exitStatus:sha.status});
if(sha.status!==0||sha.stdout.trim()!==process.env.GITHUB_SHA)throw Error('CI checkout identity mismatch.');
const save=()=>fs.writeFileSync(path.join(root,'CI_COMPONENT_COMMANDS.json'),JSON.stringify({sourceSha:sha.stdout.trim(),platform,device,entryGroup,selectedEntries,entries,commands,exitStatus:failed?1:0,full195Certified:false,completeFeatureRowsCertified:0},null,2)+'\n');
for(const entry of selectedEntries){
 const assets=path.join(root,entry,'official-assets'); // Fresh per entry: fetcher rejects existing/partial directories.
 const component={entry,expectedChecks:expectedChecks[entry],status:'failed',sourceQualified:false,full195Certified:false,scope:'bounded actual target-platform components only; not entire feature rows'};entries.push(component);
 let workspace;
 try {
  const predecessor=mobileNativeEntries[entry].predecessor;
  if(predecessor){
   const prior=entries.find(row=>row.entry===predecessor);
   if(!prior||prior.status!=='passed'||prior.sourceQualified!==true||prior.exitStatus!==0||!prior.scenarioReceipt)throw Error('Cold native entry blocked: predecessor has not completed qualified same-source acceptance.');
  }
  workspace=createEntryWorkspace({repositoryRoot:process.cwd(),sourceSha:sha.stdout.trim(),entry,platform,runnerTemp:process.env.RUNNER_TEMP,evidenceRoot:root});
  component.workspace=workspace.sourceRoot;component.initialSource=workspace.before;component.originalCheckout=workspace.original;
  // Gradle's production buildAgentPresentation hook imports the locked Node
  // toolchain too. Prepare it separately in each pristine entry, never copy a
  // dirty root node_modules or run arbitrary package lifecycle hooks.
  const nodeDirectory=path.dirname(process.execPath);
  const npmCandidates=[path.join(nodeDirectory,'node_modules','npm','bin','npm-cli.js'),path.resolve(nodeDirectory,'..','lib','node_modules','npm','bin','npm-cli.js')];
  const npmCli=npmCandidates.find(file=>fs.existsSync(file))??npmCandidates[0];
  const dependencyCommand=commands.length;
  const dependenciesReady=run(workspace.sourceRoot,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund'],600000);
  component.nodeDependencies={commandIndex:dependencyCommand,exitStatus:commands[dependencyCommand].exitStatus,ready:dependenciesReady,scope:'locked per-entry npm ci; lifecycle hooks disabled; dependency tree is not uploaded'};
  if(!dependenciesReady)throw Error('Locked Node dependency preparation failed; this entry was not launched.');
  component.afterNodeDependencies=captureSourceState({sourceRoot:workspace.sourceRoot,sourceSha:sha.stdout.trim(),evidenceDirectory:path.join(workspace.evidenceDirectory,'after-node-dependencies'),requirePristine:true});
  const officialMetadata=entry==='metadata_favorites16'||entry==='metadata_import3';
  if(officialMetadata&&!run(workspace.sourceRoot,['scripts/feature-acceptance/fetch-official-assets.mjs',assets],1100000))throw Error('Public asset GET/size/SHA verification failed; no metadata native pass is claimed.');
  const ready=run(workspace.sourceRoot,['scripts/feature-acceptance/write-ci-input.mjs',platform,device,entry,assets,String(expectedChecks[entry])],120000);
  const input=path.join(root,entry,'native-input.json');component.input=input;
  const nativeRunner=entry==='metadata_favorites16'?'scripts/feature-acceptance/run-metadata-favorites-native.mjs':entry==='metadata_import3'?'scripts/feature-acceptance/run-metadata-import-native.mjs':'scripts/feature-acceptance/run-mobile-native.mjs';
  const passed=ready&&run(workspace.sourceRoot,[nativeRunner,input]);
  component.nativeExitStatus=passed?0:1;component.status=passed?'passed':'failed';if(!passed)failed=true;
 } catch(error) {component.failure=error.message;component.nativeExitStatus??=null;failed=true;}
 finally {
  if(workspace)try {
   component.sourceAfter=captureSourceState({sourceRoot:workspace.sourceRoot,sourceSha:sha.stdout.trim(),evidenceDirectory:path.join(workspace.evidenceDirectory,'after')});
   component.sourceQualified=component.sourceAfter.clean&&component.sourceAfter.rawMatchesHead;
   component.requiresPostBuildPatchReview=!component.sourceQualified;
   if(!component.sourceQualified){if(component.nativeExitStatus===0)component.status='review-required';failed=true;}
  } catch(error){component.postBuildProvenanceFailure=error.message;component.requiresPostBuildPatchReview=true;component.sourceQualified=false;failed=true;}
  if(isMobileScenarioEntry(entry)&&component.nativeExitStatus===0){
   try{
    const nativeReceipt=JSON.parse(fs.readFileSync(path.join(root,entry,'native-mobile-receipt.json'),'utf8'));
    const scenarios=buildMobileScenarioReceipt({nativeReceipt,sourceQualified:component.sourceQualified,nativeRuntime:nativeReceipt.nativeRuntime});
    component.scenarioReceipt=path.join(root,entry,'native-mobile-scenarios-receipt.json');
    fs.writeFileSync(component.scenarioReceipt,JSON.stringify(scenarios,null,2)+'\n');
    const reopened=JSON.parse(fs.readFileSync(component.scenarioReceipt,'utf8'));
    if(reopened.checks.length!==mobileNativeEntries[entry].scenarioChecks||reopened.sourceQualified!==component.sourceQualified)throw Error('Scenario receipt readback differs.');
   }catch(error){component.scenarioReceiptFailure=error.message;component.status='failed';failed=true;}
  }
  component.exitStatus=component.status==='passed'&&component.sourceQualified?0:1;
  save();
 }
 // Each independent entry starts at the same clean immutable HEAD even after
 // a prior entry fails or Flutter rewrites tracked platform configuration.
}
save();process.exitCode=failed?1:0;
