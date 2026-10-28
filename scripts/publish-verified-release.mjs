// Manual gated publication only. Does not close or modify issues.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {assertReleasePlatformContract,assertReleaseEvidenceFiles} from './release-platform-contract.mjs';
import {assertDesktopMetadataGates} from './image-metadata-release-contract.mjs';
import {assertReleaseArtifactScope} from './release-artifact-scope.mjs';
const call=(command,args)=>execFileSync(command,args,{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024}).trim();
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const tag='v'+version, sha=call('git',['rev-parse','HEAD']);
const featureParity=JSON.parse(fs.readFileSync('release-evidence/feature-parity.json','utf8'));
assertReleasePlatformContract(featureParity,{version,sourceSha:sha});
assertReleaseEvidenceFiles(featureParity,'release-evidence');
const buildRun=process.env.BUILD_RUN;
if(!/^\d+$/.test(buildRun??''))throw Error('A verified desktop build run is required');
const build=JSON.parse(call('gh',['run','view',buildRun,'--json','headSha,jobs']));
assertDesktopMetadataGates(build);
const desktopJobs=build.jobs.filter(job=>job.name.startsWith('build ('));
if(desktopJobs.length!==2||desktopJobs.some(job=>job.conclusion!=='success')||!build.jobs.some(job=>job.name==='mac-intel-smoke'&&job.conclusion==='success'))throw Error('All desktop builds and native Intel verification must pass');
const windows=desktopJobs.find(job=>job.name.includes('windows'));
for(const name of ['Decode final Windows installers with the actual NSIS decoder','Verify Windows clean installation and upgrade from 2.4.0']){
 if(!windows?.steps?.some(step=>step.name===name&&step.conclusion==='success'))throw Error('Required installation gate did not pass: '+name);
}
call('gh',['run','download',buildRun,'-n','packaged-smoke-windows','-D','windows-install-evidence']);
const installation=JSON.parse(fs.readFileSync('windows-install-evidence/upgrade-smoke/verification.json','utf8'));
if(!installation.pass||installation.version!==version||!installation.userDataPreserved||!installation.legacyRuntimePreserved)throw Error('Actual installation evidence missing');
// Retry only the publication tooling: installers must match every application file.
call('git',['diff','--exit-code',build.headSha,sha,'--','.',':!scripts/publish-verified-release.mjs',':!.github/workflows/build.yml']);
const files=[`Langbai-NovelAI-Studio-Setup-${version}.exe`,`Langbai-NovelAI-Studio-${version}.exe`,`Langbai-NovelAI-Studio-${version}-universal.dmg`,`Langbai-NovelAI-Studio-${version}.zip`].map(name=>path.join('release-assets',name));
assertReleaseArtifactScope(files.map(file=>path.basename(file)),{version});
for(const file of files)if(!fs.existsSync(file)||fs.statSync(file).size===0)throw Error('Missing asset '+file);
if(installation.installerSha256.toLowerCase()!==crypto.createHash('sha256').update(fs.readFileSync(files[0])).digest('hex'))throw Error('Published installer is not the one tested through a real upgrade');
const existing=spawnSync('gh',['release','view',tag],{encoding:'utf8',timeout:30000});
if(existing.status===0)throw Error('Release already exists; do not overwrite it');
if(!/not found/i.test(existing.stderr??''))throw Error('Release existence check failed: '+existing.stderr);
const evidence={version,sha,releaseScopeId:featureParity.releaseScopeId,releasePlatforms:featureParity.platforms,releaseScopeSummary:featureParity.summary,buildRun,desktopSourceSha:build.headSha,assets:files.map(file=>({name:path.basename(file),size:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};
fs.writeFileSync('release-assets/verification.json',JSON.stringify(evidence,null,2));
call('gh',['release','create',tag,...files,'release-assets/verification.json','--target',sha,'--draft','--title',`Langbai NovelAI Studio ${tag}`,'--notes-file','docs/RELEASE_NOTES.md']);
const draft=JSON.parse(call('gh',['release','view',tag,'--json','isDraft,assets']));
assertReleaseArtifactScope(draft.assets.map(asset=>asset.name),{version,withVerification:true});
if(!draft.isDraft||files.some(file=>!draft.assets.some(asset=>asset.name===path.basename(file)&&asset.size===fs.statSync(file).size)))throw Error('Draft asset verification failed');
call('gh',['release','edit',tag,'--draft=false','--latest']);
const published=JSON.parse(call('gh',['release','view',tag,'--json','isDraft,url,assets']));
assertReleaseArtifactScope(published.assets.map(asset=>asset.name),{version,withVerification:true});
if(published.isDraft||files.some(file=>!published.assets.some(asset=>asset.name===path.basename(file))))throw Error('Publication readback failed');
console.log('VERIFIED_RELEASE_PUBLISHED',published.url);
