import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
import {releaseFeatures,releasePlatforms,fullFeatureProfiles,profileSha256,assertScenarioReceipt} from './full-feature-profiles.mjs';
import {assertReleasePlatformContract,assertReleaseEvidenceFiles,supportedPlatforms,releaseExcludedPlatforms,releaseFeatureApplicability,releaseScopeId,releaseScopeSha256,releaseScopeCounts} from '../release-platform-contract.mjs';
import {windowsArtistRuntimeType} from './windows-artist-contract.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export function buildFullFeatureMatrix({version,sourceSha,receipts=[]}){
 const accepted=[],diagnostics=[];
 for(const item of receipts){
  const r=item.receipt;
  if(r?.schema!=='client-feature-scenarios/v1'){diagnostics.push({artifact:item.artifact,classification:'legacy-component-only',sourceSha:r?.sourceSha??null,platform:r?.platform??null});continue;}
  try{assertScenarioReceipt(r,{sourceSha,windowsArtistProof:item.windowsArtistProof});if(!releasePlatforms.includes(r.platform)){diagnostics.push({artifact:item.artifact,classification:'outside-explicit-release-platform',sourceSha:r.sourceSha,platform:r.platform});continue;}accepted.push(item);}catch(error){diagnostics.push({artifact:item.artifact,classification:'not-release-qualified',reason:error.message,sourceSha:r?.sourceSha??null,platform:r?.platform??null});}
 }
 const features=releaseFeatures.map(id=>({id,platforms:Object.fromEntries(releasePlatforms.map(platform=>{
  const requiredScenarios=[...fullFeatureProfiles[id].scenarios],all=[],local=[],component=[];
  for(const item of receipts){const r=item.receipt;if(r?.platform!==platform||r.sourceSha!==sourceSha)continue;for(const c of r.checks??[]){if(c.feature!==id)continue;
    if(c.scenario&&requiredScenarios.includes(c.scenario)&&c.exitStatus===0&&c.skipped===false&&r.exitStatus===0)local.push(c.scenario);
    if(c.acceptanceLevel==='component-only'||r.schema!=='client-feature-scenarios/v1')component.push(c.journey??c.scenario??'bounded component');
  }}
  for(const item of accepted)if(item.receipt.platform===platform)for(const check of item.receipt.checks)if(check.feature===id)all.push({check,item});
  const completedScenarios=[...new Set(all.map(x=>x.check.scenario))],missingScenarios=requiredScenarios.filter(s=>!completedScenarios.includes(s));
  const evidence=[];for(const{check,item}of all){const key=item.artifact+'|'+check.kind;if(evidence.some(e=>e._key===key))continue;evidence.push({_key:key,sourceSha,feature:id,platform,kind:check.kind,exitStatus:0,skipped:false,artifact:item.artifact,sha256:item.sha256,...(item.windowsArtistProofArtifact?{companionProofArtifact:item.windowsArtistProofArtifact,companionProofSha256:item.windowsArtistProofFileSha256}:{})});}
  const applicability=releaseFeatureApplicability(id,platform);
  if(applicability==='not-supported') {
   // Keep original scenario IDs and observations, but never invent a pass/proof.
   const excludedObservedScenarios=[...completedScenarios];
   if(all.length||local.length||component.length)diagnostics.push({classification:'outside-explicit-release-scope',feature:id,platform,scenarios:excludedObservedScenarios,artifacts:[...new Set(all.map(x=>x.item.artifact))]});
   return[platform,{applicability,status:'not-supported',reasonCode:releaseScopeId,declaredScenarios:requiredScenarios,requiredScenarios:[],completedScenarios:[],missingScenarios:[],excludedObservedScenarios,unqualifiedObservedScenarios:[...new Set(local)],componentObservations:[...new Set(component)],evidence:[]}];
  }
  const status=missingScenarios.length===0?'verified':all.length||local.length||component.length?'partial':'pending';
  return[platform,{applicability,status,declaredScenarios:[...requiredScenarios],requiredScenarios,completedScenarios,missingScenarios,unqualifiedObservedScenarios:[...new Set(local)].filter(s=>!completedScenarios.includes(s)),componentObservations:[...new Set(component)],evidence:status==='verified'?evidence.map(({_key,...proof})=>proof):[]}];
 }))}));
 const slots=features.flatMap(f=>releasePlatforms.map(p=>({feature:f.id,platform:p,...f.platforms[p]}))),verified=slots.filter(s=>s.status==='verified').length;
 return{schema:2,version,sourceSha,platforms:[...releasePlatforms],supportedPlatforms:[...supportedPlatforms],excludedPlatforms:[...releaseExcludedPlatforms],profileSha256,releaseScopeId,releaseScopeSha256,features,summary:{...releaseScopeCounts,verifiedSlots:verified,partialSlots:slots.filter(s=>s.status==='partial').length,pendingSlots:slots.filter(s=>s.status==='pending').length,missingScenarioSlots:slots.reduce((n,s)=>n+s.missingScenarios.length,0)},full195Certified:false,full156Certified:false,releaseScopeCertified:verified===releaseScopeCounts.requiredSlots&&slots.filter(s=>s.status==='not-supported').length===releaseScopeCounts.notSupportedSlots&&/^[a-f0-9]{40}$/i.test(sourceSha),releaseReady:false,diagnostics,boundary:'Current release declares36 features on two desktop platforms (72 cells). Local artist-iteration is Windows-only; it is not-supported on macOS (one cell, never passes). All71 required cells retain real native/runtime acceptance; scope certification alone is not publication readiness. Components, dirty source, failed or skipped checks never certify rows.'};
}

export function collectReceiptFiles(evidenceRoot,outputRoot){
 const root=fs.realpathSync(evidenceRoot),destination=path.join(outputRoot,'evidence');fs.mkdirSync(destination,{recursive:true});const rows=[];
 function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.isSymbolicLink())continue;const full=path.join(dir,ent.name);if(ent.isDirectory()){if(!['node_modules','.git','source','compiled','profile','disposable-profile','library-profile','browser-profile','isolated-native-profile','isolated-offline-profile','environment','evidence'].includes(ent.name))walk(full);}else if(ent.isFile()&&/(?:^|[-_])(?:receipt|scenarios)\.json$/i.test(ent.name)){
   const stat=fs.statSync(full);if(stat.size>64*1024*1024)throw Error('Receipt exceeds bounded64MiB: '+path.relative(root,full));const bytes=fs.readFileSync(full);let receipt;try{receipt=JSON.parse(bytes);}catch{throw Error('Malformed execution receipt: '+path.relative(root,full));}
   const hash=sha(bytes),name=hash+'.json',target=path.join(destination,name);if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});if(sha(fs.readFileSync(target))!==hash)throw Error('Evidence copy mismatch');const row={artifact:path.posix.join('evidence',name),sha256:hash,receipt,origin:path.relative(root,full)};
   if(receipt.nativeRuntime?.type===windowsArtistRuntimeType){
    const proofFile=path.join(path.dirname(full),'controller-proof.json');
    if(fs.existsSync(proofFile)){
     const stat=fs.lstatSync(proofFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error('Windows Artist controller proof must be a bounded sibling regular file');
     const proofBytes=fs.readFileSync(proofFile),proofSha=sha(proofBytes),proofName=proofSha+'.windows-artist-proof.json';
     row.windowsArtistProof=JSON.parse(proofBytes);row.windowsArtistProofArtifact=path.posix.join('evidence',proofName);row.windowsArtistProofFileSha256=proofSha;
     const copy=path.join(destination,proofName);if(!fs.existsSync(copy))fs.writeFileSync(copy,proofBytes,{flag:'wx'});if(sha(fs.readFileSync(copy))!==proofSha)throw Error('Windows Artist controller proof evidence copy mismatch');
    }
   }
   rows.push(row);
  }}}
 walk(root);return rows;
}

export function writeFullFeatureMatrix({evidenceRoot,outputRoot,sourceSha,version,requireFull=false,requireReleaseScope=false}){
 fs.mkdirSync(outputRoot,{recursive:true});const receipts=collectReceiptFiles(evidenceRoot,outputRoot),report=buildFullFeatureMatrix({sourceSha,version,receipts});
 if(report.releaseScopeCertified){assertReleasePlatformContract(report,{sourceSha,version});assertReleaseEvidenceFiles(report,outputRoot);}
 fs.writeFileSync(path.join(outputRoot,'FULL_FEATURE_MATRIX.json'),JSON.stringify(report,null,2)+'\n');
 const lines=['# Desktop release acceptance matrix','',`Source: ${sourceSha}; version: ${version}; verified required cells: ${report.summary.verifiedSlots}/${releaseScopeCounts.requiredSlots}; declared: ${releaseScopeCounts.declaredSlots}; not-supported: ${releaseScopeCounts.notSupportedSlots} (not passes).`, '', '| Feature | Windows | macOS |','|---|---|---|'];
 for(const f of report.features)lines.push('| '+f.id+' | '+releasePlatforms.map(p=>`${f.platforms[p].status} ${f.platforms[p].completedScenarios.length}/${f.platforms[p].requiredScenarios.length}`).join(' | ')+' |');
 lines.push('','Pending/partial is not a release pass. Not-supported is not a pass. See JSON missingScenarios and receipt diagnostics.');fs.writeFileSync(path.join(outputRoot,'FULL_FEATURE_MATRIX.md'),lines.join('\n')+'\n');
 const reopened=fs.readFileSync(path.join(outputRoot,'FULL_FEATURE_MATRIX.json'));
 // The publisher consumes this exact filename. Preserve the matrix verbatim,
 // including pending/partial status; an alias is not a certification override.
 const publisherFile=path.join(outputRoot,'feature-parity.json');fs.writeFileSync(publisherFile,reopened);
 if(!fs.readFileSync(publisherFile).equals(reopened))throw Error('Publisher evidence alias bytes differ');
 console.log(JSON.stringify({file:path.join(outputRoot,'FULL_FEATURE_MATRIX.json'),publisherFile,bytes:reopened.length,sha256:sha(reopened),...report.summary,full195Certified:report.full195Certified,full156Certified:report.full156Certified,releaseScopeCertified:report.releaseScopeCertified,releaseReady:report.releaseReady}));
 return{report,exitStatus:(requireFull&&!report.full195Certified)||(requireReleaseScope&&!report.releaseScopeCertified)?1:0};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const[evidenceRoot,outputRoot,sourceSha,version,...flags]=process.argv.slice(2);if(!evidenceRoot||!outputRoot||!sourceSha||!/^\d+\.\d+\.\d+$/.test(version??''))throw Error('usage: build-full-feature-matrix.mjs EVIDENCE_ROOT OUTPUT_ROOT SOURCE_SHA VERSION [--require-full | --require-release-scope]');
 if(flags.some(flag=>!['--require-full','--require-release-scope'].includes(flag))||new Set(flags).size!==flags.length)throw Error('Unknown or repeated acceptance flag');
 process.exitCode=writeFullFeatureMatrix({evidenceRoot,outputRoot,sourceSha,version,requireFull:flags.includes('--require-full'),requireReleaseScope:flags.includes('--require-release-scope')}).exitStatus;
}
