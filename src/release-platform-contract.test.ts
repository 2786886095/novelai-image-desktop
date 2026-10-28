import {describe,it,expect} from 'vitest';
import {assertReleasePlatformContract,assertReleaseEvidenceFiles,releaseFeatures,releasePlatforms,supportedPlatforms,releaseExcludedPlatforms,releaseFeatureApplicability,releaseScopeId,releaseScopeSha256,releaseScopeCounts,artistIterationScenarios} from '../scripts/release-platform-contract.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {profileSha256} from '../scripts/feature-acceptance/full-feature-profiles.mjs';
import {createWindowsArtistUnitProof} from '../scripts/feature-acceptance/windows-artist-contract-fixture.mjs';
import {windowsArtistScenarioReceipt} from '../scripts/feature-acceptance/windows-artist-contract.mjs';
const sourceSha='a'.repeat(40),version='2.5.7';
const complete=()=>({schema:2,version,sourceSha,profileSha256,releaseScopeId,releaseScopeSha256,full195Certified:false,full156Certified:false,releaseScopeCertified:true,releaseReady:false,summary:{...releaseScopeCounts,verifiedSlots:releaseScopeCounts.requiredSlots,partialSlots:0,pendingSlots:0},platforms:[...releasePlatforms],supportedPlatforms:[...supportedPlatforms],excludedPlatforms:[...releaseExcludedPlatforms],features:releaseFeatures.map(id=>({id,platforms:Object.fromEntries(releasePlatforms.map(platform=>[platform,releaseFeatureApplicability(id,platform)==='not-supported'?{applicability:'not-supported',status:'not-supported',reasonCode:releaseScopeId,declaredScenarios:[...artistIterationScenarios],requiredScenarios:[],completedScenarios:[],missingScenarios:[],evidence:[]}:{applicability:'required',status:'verified',evidence:[{sourceSha,feature:id,platform,exitStatus:0,skipped:false,kind:'integration',artifact:'neutral-fixture.json',sha256:'b'.repeat(64)}]}]))}))});
describe('Windows and macOS desktop publication contract (synthetic evidence schema, not device acceptance)',()=>{
  it('accepts a complete fixture without certifying the actual application',()=>expect(assertReleasePlatformContract(complete(),{version,sourceSha})).toEqual({platforms:2,features:36}));
  it('rejects old five/four-platform scopes and injected removed-platform cells',()=>{for(const id of ['artist-iteration-windows-only/v1','windows-local-capabilities-no-ios/v2','desktop-windows-local-capabilities/v3','desktop-windows-local-capabilities/v4']){const r={...complete(),releaseScopeId:id};expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();}for(const removed of ['linux','android','ios']){const x=complete();Object.assign(x.features[0].platforms,{[removed]:{...x.features[0].platforms.macos}});expect(()=>assertReleasePlatformContract(x,{version,sourceSha})).toThrow();}});
  it.each(['artist-iteration'])('rejects exempting Windows %s',feature=>{const r=complete(),row=r.features.find(f=>f.id===feature)!;row.platforms.windows={...row.platforms.macos};expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it.each(['agent-components','image-agent','updates'])('rejects a removed %s feature row',feature=>{const r=complete();r.features.push({...r.features.find(f=>f.id==='backup')!,id:feature});expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow(/Unrecognized feature/);});
  it('rejects Windows-only scope',()=>{const r=complete();r.platforms=['windows'];expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects absent feature evidence',()=>expect(()=>assertReleasePlatformContract(undefined,{version,sourceSha})).toThrow());
  it('rejects a different source',()=>{const r=complete();r.sourceSha='c'.repeat(40);expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects version-only synchronization',()=>{const r=complete();r.features[0].platforms.macos.status='source-synced';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing macOS OpenAI inpaint',()=>{const r=complete();r.features.find(f=>f.id==='openai-inpaint')!.platforms.macos.status='missing';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing MCP server',()=>{const r=complete();r.features.find(f=>f.id==='external-mcp-server')!.platforms.macos.status='missing';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects skipped execution',()=>{const r=complete();r.features[0].platforms.macos.evidence[0].skipped=true;expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects failed execution',()=>{const r=complete();r.features[0].platforms.macos.evidence[0].exitStatus=1;expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects build-only evidence',()=>{const r=complete();r.features[0].platforms.macos.evidence[0].kind='compile-only';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing and duplicate features',()=>{const r=complete();r.features.pop();expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();r.features.push(r.features[0]);expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects absent evidence hash',()=>{const r=complete();r.features[0].platforms.macos.evidence[0].sha256='';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('checks actual evidence bytes and literal execution records',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-parity-proof-'));
    try {
      const r=complete();
      const checks=r.features.flatMap(f=>releasePlatforms.map(platform=>({sourceSha,feature:f.id,platform,kind:'integration',exitStatus:0,skipped:false,command:['neutral-fixture'],stdout:'synthetic schema check',stderr:''})));
      const data=JSON.stringify({checks});fs.writeFileSync(path.join(root,'synthetic-schema-fixture.json'),data);
      const sha=crypto.createHash('sha256').update(data).digest('hex');
      for(const f of r.features) for(const p of releasePlatforms) {if(f.platforms[p].status==='not-supported')continue;f.platforms[p].evidence[0].artifact='synthetic-schema-fixture.json';f.platforms[p].evidence[0].sha256=sha;}
      // Windows Artist has a separate exact-proof route, not a generic schema
      // check. The shared builder is explicitly UNIT_ONLY (never device proof).
      const fixture=createWindowsArtistUnitProof({profileSha256}),receipt=windowsArtistScenarioReceipt(fixture.proof,fixture.bindings);
      const proofText=JSON.stringify(fixture.proof),receiptText=JSON.stringify(receipt),hash=(text:string)=>crypto.createHash('sha256').update(text).digest('hex');
      fs.writeFileSync(path.join(root,'controller-proof.json'),proofText);fs.writeFileSync(path.join(root,'artist-receipt.json'),receiptText);
      Object.assign(r.features.find(f=>f.id==='artist-iteration')!.platforms.windows.evidence[0],{kind:'native-runtime',artifact:'artist-receipt.json',sha256:hash(receiptText),companionProofArtifact:'controller-proof.json',companionProofSha256:hash(proofText)});
      expect(()=>assertReleaseEvidenceFiles(r,root)).not.toThrow();
      fs.appendFileSync(path.join(root,'synthetic-schema-fixture.json'),' ');
      expect(()=>assertReleaseEvidenceFiles(r,root)).toThrow('bytes changed');
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  it('rejects an existing evidence path outside the evidence root',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-parity-proof-'));
    try {fs.mkdirSync(path.join(root,'evidence'));fs.writeFileSync(path.join(root,'outside.json'),'{}');const r=complete();r.features[0].platforms.windows.evidence[0].artifact='../outside.json';expect(()=>assertReleaseEvidenceFiles(r,path.join(root,'evidence'))).toThrow('stay');}
    finally{fs.rmSync(root,{recursive:true,force:true});}
  });
});
