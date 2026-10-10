import {describe,it,expect} from 'vitest';
import {assertReleasePlatformContract,assertReleaseEvidenceFiles,releaseFeatures,releasePlatforms} from '../scripts/release-platform-contract.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const sourceSha='a'.repeat(40),version='2.5.7';
const complete=()=>({schema:1,version,sourceSha,platforms:[...releasePlatforms],features:releaseFeatures.map(id=>({id,platforms:Object.fromEntries(releasePlatforms.map(platform=>[platform,{status:'verified',evidence:[{sourceSha,feature:id,platform,exitStatus:0,skipped:false,kind:'integration',artifact:'neutral-fixture.json',sha256:'b'.repeat(64)}]}]))}))});
describe('five-platform publication contract (synthetic evidence schema, not device acceptance)',()=>{
  it('accepts a complete fixture without certifying the actual application',()=>expect(assertReleasePlatformContract(complete(),{version,sourceSha})).toEqual({platforms:5,features:39}));
  it('rejects Windows-only scope',()=>{const r=complete();r.platforms=['windows'];expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects absent feature evidence',()=>expect(()=>assertReleasePlatformContract(undefined,{version,sourceSha})).toThrow());
  it('rejects a different source',()=>{const r=complete();r.sourceSha='c'.repeat(40);expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects version-only synchronization',()=>{const r=complete();r.features[0].platforms.android.status='source-synced';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing mobile OpenAI inpaint',()=>{const r=complete();r.features.find(f=>f.id==='openai-inpaint')!.platforms.ios.status='missing';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing MCP server',()=>{const r=complete();r.features.find(f=>f.id==='external-mcp-server')!.platforms.android.status='missing';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects skipped execution',()=>{const r=complete();r.features[0].platforms.ios.evidence[0].skipped=true;expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects failed execution',()=>{const r=complete();r.features[0].platforms.linux.evidence[0].exitStatus=1;expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects build-only evidence',()=>{const r=complete();r.features[0].platforms.ios.evidence[0].kind='compile-only';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects missing and duplicate features',()=>{const r=complete();r.features.pop();expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();r.features.push(r.features[0]);expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('rejects absent evidence hash',()=>{const r=complete();r.features[0].platforms.macos.evidence[0].sha256='';expect(()=>assertReleasePlatformContract(r,{version,sourceSha})).toThrow();});
  it('checks actual evidence bytes and literal execution records',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-parity-proof-'));
    try {
      const r=complete();
      const checks=r.features.flatMap(f=>releasePlatforms.map(platform=>({sourceSha,feature:f.id,platform,kind:'integration',exitStatus:0,skipped:false,command:['neutral-fixture'],stdout:'synthetic schema check',stderr:''})));
      const data=JSON.stringify({checks});fs.writeFileSync(path.join(root,'synthetic-schema-fixture.json'),data);
      const sha=crypto.createHash('sha256').update(data).digest('hex');
      for(const f of r.features) for(const p of releasePlatforms) {f.platforms[p].evidence[0].artifact='synthetic-schema-fixture.json';f.platforms[p].evidence[0].sha256=sha;}
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
