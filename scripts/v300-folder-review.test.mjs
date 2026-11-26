import test from 'node:test';import assert from 'node:assert/strict';
import {assertV286CloudNativeRun} from './release-platform-contract.mjs';
const sha='c02d3186fc1b014d3e3611e07b7698cd5c448713';
const components=['core','text','library','os','metadata','gallery','japanese','generation','ui','workflows'];
const failures=new Map([['ios-components (os)','Run independently counted component and client-scenario entries'],['full-client-feature-matrix','Verify all required cloud cells and preserve the exact matrix']]);
function fixture(){return {headSha:sha,status:'completed',conclusion:'failure',jobs:[
  ...['windows-latest','macos-15','ubuntu-24.04'].map(x=>'desktop-components ('+x+')'),
  ...['ios','android'].flatMap(p=>components.map(c=>p+'-components ('+c+')')),
  'full-client-feature-matrix','windows-artist-local-proof'].map(name=>({name,status:'completed',
  conclusion:failures.has(name)?'failure':name==='windows-artist-local-proof'?'skipped':'success',
  steps:failures.has(name)?[{name:failures.get(name),conclusion:'failure'}]:[]}))};}
const check=r=>assertV286CloudNativeRun(r,{sourceSha:sha,reviewedIosFolder:true});
test('only the exact reviewed run shape is admissible',()=>{check(fixture());assert.throws(()=>assertV286CloudNativeRun(fixture(),{sourceSha:sha}));const r=fixture();r.headSha='0'.repeat(40);assert.throws(()=>check(r));});
test('another failed native job is never waived',()=>{const r=fixture();r.jobs.find(j=>j.name==='ios-components (generation)').conclusion='failure';assert.throws(()=>check(r));});
test('another failed step in an allowed job is never waived',()=>{for(const name of failures.keys()){const r=fixture();r.jobs.find(j=>j.name===name).steps.push({name:'unrelated check',conclusion:'failure'});assert.throws(()=>check(r));}});

test('v3.0.1 exemptions are source-bound and do not require claiming that the picker failed',()=>{
 const sha301='a3cd315029c2bc4314d5a112d3e132806392c693',r=fixture();r.headSha=sha301;
 const verify=(folder)=>assertV286CloudNativeRun(r,{sourceSha:sha301,strictGpuMatrix301:true,reviewedIosFolder:folder});
 verify(true);
 const os=r.jobs.find(j=>j.name==='ios-components (os)');os.conclusion='success';os.steps=[];verify(false);
 r.jobs.find(j=>j.name==='ios-components (ui)').conclusion='failure';assert.throws(()=>verify(false));
 assert.throws(()=>assertV286CloudNativeRun(fixture(),{sourceSha:sha,strictGpuMatrix301:true}));
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {zstdCompressSync} from 'node:zlib';
import {focusedFailureTree} from './v300-folder-review.mjs';
test('late witness requires a referenced, unique, focused nonempty editor in the same PID, not an arbitrary dump',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'picker-review-'));
 try {
  const id=c=>'0~'+c.repeat(86)+'==';const file=c=>path.join(dir,'data.'+id(c));
  const header="Attributes: Application, 0xabc, pid: 42, label: 'Langbai Studio'";
  const line="  TextView, 0xdef, {{3.0, 4.0}, {19.0, 6.0}}, identifier: 'DOC.inlineRenameField', value: untitled folder, Keyboard Focused";
  const write=(text,name='final-picker-state-actual-accessibility-tree')=>{
   fs.writeFileSync(file('a'),zstdCompressSync(Buffer.from(text)));
   fs.writeFileSync(file('b'),zstdCompressSync(Buffer.from('K4:name[S6:StringK2:_vV44:'+name+']K10:payloadRef[S9:ReferenceK2:id[S6:StringK2:_vV90:'+id('a')+']]K11:payloadSize[S3:IntK2:_vV3:'+Buffer.byteLength(text)+']')));
  };
  const text=header+'\n'+line;write(text);assert.equal(focusedFailureTree(dir,42)?.kind,'post-timeout-focused-editor');assert.equal(focusedFailureTree(dir,43),null);
  for(const invalid of [text.replace('Keyboard Focused','Not Focused'),text.replace('19.0','0.0'),text.replace('DOC.inlineRenameField','UISearchBarTextField'),text+'\n'+line]){write(invalid);assert.equal(focusedFailureTree(dir,42),null);}
  write(text,'unrelated-attachment');assert.equal(focusedFailureTree(dir,42),null);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
