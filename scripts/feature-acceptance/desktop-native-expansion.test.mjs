import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fullFeatureProfiles} from './full-feature-profiles.mjs';
import {runBoundedNativeCommand} from './bounded-native-command.mjs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const ai=read('./run-desktop-ai-native.mjs'),journeys=read('./desktop-ai-journeys.cjs'),tools=read('./desktop-tools-gallery-journeys.cjs'),runner=read('./run-desktop-tools-gallery-native.mjs');
const declared=source=>[...source.matchAll(/await check\('([^']+)','([^']+)'/g)].map(m=>m.slice(1,3));
const expectedAi=[['reverse','mode-and-scope-system-import'],['reverse','valid-json-and-visible-result'],['reverse','refusal-truncated-invalid-preserve'],['convert','three-modes-and-import'],['convert','structured-variants-preserve-escapes'],['convert','errors-preserve-results'],['translation','languages-source-detect'],['translation','preserve-tags-weights'],['translation','failure-cancel-no-overwrite'],['ai-records','record-request-response-status'],['ai-records','refresh-expand-clear-memory-history-boundary'],['ai-records','sensitive-fields-redacted'],['reverse','versioned-skill-catalog-and-models'],['reverse','inline-controls-stale-no-apply'],['convert','versioned-skill-editing-overlays'],['settings','skill-selection-custom-cold-reopen'],['settings','persist-and-reopen'],['settings','independent-service-proxy'],['settings','invalid-change-no-destruction'],['external-mcp-server','tool-discovery-native-bridge'],['external-mcp-server','actual-local-tool-request'],['external-mcp-server','auth-errors-budget-safety']];
const expectedTools=[['tools','all-user-exposed-tools'],['tools','arguments-output-files'],['tools','errors-privacy-cancel'],['online-gallery','browse-search-pagination'],['online-gallery','inspect-download-presets'],['online-gallery','network-error-cancel']];
for(const[name,source,controller,expected]of [['ai',journeys,ai,expectedAi],['tools/gallery',tools,runner,expectedTools]])test(name+' independently retains exact scenario inventory and current profile registration',()=>{
 assert.deepEqual(declared(source),expected);
 const start=controller.indexOf('const expected='),end=controller.indexOf(';',start);const inventory=new Function(controller.slice(start,end)+';return expected;')();assert.deepEqual(inventory,expected);
 for(const[feature,scenario]of expected)assert(fullFeatureProfiles[feature].scenarios.includes(scenario),feature+'/'+scenario);
});
test('AI controller keeps existing 180s/45s bounds, real independent cold OS invocation and all 22 check requirement',async()=>{
 assert.match(ai,/actual=await command\(argv,180000\)/);assert.match(ai,/cold=await command\(\[\.\.\.argv,'--cold-reopen'\],45000\)/);
 assert.match(journeys,/assert\.notEqual\(value\.pid,expected\.parentPid\)/);assert.match(journeys,/assert\.deepEqual\(value\.skills,expected\.skills\)/);
 assert.match(ai,/report\.total===expected\.length/);assert.match(ai,/actualNativeSkillsReopened:true/);assert.match(ai,/actual\.timedOut\|\|actual\.outputOverflow\|\|actual\.error/);
 const run=fs.mkdtempSync(path.join(os.tmpdir(),'ai-controller-bound-')),ledger=[];
 const a=ai.indexOf('async function command('),b=ai.indexOf('\nconst expected=',a);
 const command=new Function('fs','path','run','ledger','source','runBoundedNativeCommand',ai.slice(a,b)+';return command;')(fs,path,run,ledger,process.cwd(),runBoundedNativeCommand);
 const ok=await command([process.execPath,'-e','process.stdout.write("AI_OUT\\n");process.stderr.write("AI_ERR\\n")']);assert.equal(ok.exitStatus,0);assert.equal(ok.stdout,'AI_OUT\n');assert.equal(ok.stderr,'AI_ERR\n');
 const fail=await command([process.execPath,'-e','setInterval(()=>{},1000)'],300);assert.equal(fail.exitStatus,124);assert.equal(fail.timedOut,true);assert.equal(fail.cleanupComplete,true);assert(fail.elapsedMs<6500);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run,'command-ledger.json'))),ledger);
});
test('tools/gallery uses actual sandbox renderer, native CA trust and never disables TLS or exposes clipboard',()=>{
 assert.match(tools,/sandbox:true,nodeIntegration:false,contextIsolation:true/);assert.match(runner,/NODE_EXTRA_CA_CERTS=tlsCert/);
 assert.match(runner,/runBoundedNativeCommand\(argv,\{cwd:run,env,timeout:240000/);assert.match(tools,/220000/);
 assert.doesNotMatch(runner+tools,/NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized:false|ignore-certificate-errors|navigator\.clipboard|require\('electron'\)\.clipboard/);
 assert.match(tools,/getHistoryDates:\(\)=>store\.getHistoryDates\(\)/);assert.match(tools,/detail\.media\[0\]\.downloadUrl/);
 assert.match(tools,/actualProductionToolCards/);assert.match(tools,/actualOperationalProof/);assert.match(tools,/assert\.rejects\(pending\)/);
});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function proofFixture(){
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'tool-proof-source-')),root=fs.mkdtempSync(path.join(os.tmpdir(),'tool-proof-evidence-')),run=path.join(root,'run');fs.mkdirSync(path.join(source,'src'));fs.writeFileSync(path.join(source,'src/input.ts'),'actual tracked bytes');
 const row={path:'src/input.ts',sha256:sha(fs.readFileSync(path.join(source,'src/input.ts')))};for(const step of ['before','after']){fs.mkdirSync(path.join(run,'source-'+step),{recursive:true});fs.writeFileSync(path.join(run,'source-'+step,'tracked-source-manifest.json'),JSON.stringify([row]));}
 fs.writeFileSync(path.join(run,'SETUP.json'),JSON.stringify({source}));
 const checks=[['batch','cancel-errors-retry'],['comic','context-convert-generate'],['comic','cancel-selective-export']].map(([feature,scenario])=>({feature,scenario,exitStatus:0,skipped:false}));
 const config={source,sourceSha:'a'.repeat(40),profileSha256:'current-profile',generationEvidenceRoot:root},value={schema:'client-feature-scenarios/v1',sourceSha:config.sourceSha,platform:'windows',profileSha256:config.profileSha256,nativeRuntime:{type:'electron',version:'42.11.0'},mockedModules:false,isolated:true,exitStatus:0,sourceQualified:true,checks,run},file=path.join(root,'native-receipt.json');
 const write=()=>fs.writeFileSync(file,JSON.stringify(value));write();
 const a=tools.indexOf('function generationProof(){'),b=tools.indexOf("\napp.whenReady()",a);const execute=new Function('config','fs','path','assert','process','sha',tools.slice(a,b)+';return generationProof;')(config,fs,path,assert,{platform:'win32',versions:{electron:'42.11.0'}},sha);
 return{source,root,run,config,value,write,execute};
}
test('tools dependency refuses absent, wrong profile/platform/runtime, mocked or nonqualified release proof',()=>{
 for(const patch of [{profileSha256:'old-profile'},{platform:'macos'},{nativeRuntime:{type:'node',version:'42.11.0'}},{mockedModules:true},{sourceQualified:false},{checks:[]}]){const f=proofFixture();Object.assign(f.value,patch);f.write();assert.throws(f.execute,/proof missing/);}
 const f=proofFixture();f.config.generationEvidenceRoot=null;assert.throws(f.execute,/Same-source generation receipt is required/);
});
test('tools dependency checks actual source bytes before/after and refuses other compilation workspace',()=>{
 let f=proofFixture();assert.equal(f.execute().length,3);fs.writeFileSync(path.join(f.source,'src/input.ts'),'drift');assert.throws(f.execute,/product source differs/);
 f=proofFixture();fs.writeFileSync(path.join(f.run,'source-after','tracked-source-manifest.json'),JSON.stringify([{path:'src/input.ts',sha256:'changed'}]));assert.throws(f.execute,/source drifted/);
 f=proofFixture();fs.writeFileSync(path.join(f.run,'SETUP.json'),JSON.stringify({source:f.root}));assert.throws(f.execute,/different workspace/);
});
test('uncommitted local diagnosis is explicitly not promoted to qualified release evidence',()=>{
 const f=proofFixture();f.config.sourceSha='uncommitted';f.value.sourceSha='uncommitted';f.value.sourceQualified=false;f.write();const proof=f.execute();assert(proof.every(item=>item.releaseQualified===false&&item.uncommittedBoundary.includes('Diagnostic only')));
});
