import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseWindowsArtistArguments,parseArtistGpu,artistIsolatedEnvironment,hashArtistFile} from './run-windows-artist-native.mjs';
const fixture=()=>{const parent=fs.realpathSync(os.tmpdir()),root=fs.realpathSync(fs.mkdtempSync(path.join(parent,'artist-controller-unit-')));return {root,close:()=>{assert.equal(path.dirname(fs.realpathSync(root)),parent);assert(path.basename(root).startsWith('artist-controller-unit-'));fs.rmSync(root,{recursive:true,force:true});}};};
test('requires explicit absolute paths and immutable SHA, no implicit model/download',()=>{const base=path.resolve('fixture'),args=['--source',base,'--out',base+'-out','--source-sha','a'.repeat(40),'--python',path.join(base,'python.exe'),'--assets',path.join(base,'assets'),'--assets-archive',path.join(base,'assets.zip'),'--runtime-archive',path.join(base,'runtime.zip')];assert.equal(parseWindowsArtistArguments(args)['source-sha'],'a'.repeat(40));for(const bad of [[],args.slice(0,-2),[...args,'--download','true'],[...args,'--source',base],args.map(x=>x==='a'.repeat(40)?'uncommitted':x),args.map(x=>x===base?'relative':x)])assert.throws(()=>parseWindowsArtistArguments(bad));});
test('GPU parser refuses any other compute process and inadequate free memory, never kills',()=>{assert.equal(parseArtistGpu('0, RTX 5070, 616.92, 12227, 12000\n','').freeMiB,12000);for(const pair of [['0, GPU, driver, 12227, 8000',''],['0, GPU, driver, 12227, 12000','123, 200'],['1, GPU, driver, 12227, 12000',''],['0, GPU, driver, 12227, 12000\n1, GPU, driver, 12227, 12000',''],['error','']])assert.throws(()=>parseArtistGpu(...pair));});
test('all writable model/ML/profile caches external and credentials/real proxy removed',()=>{const f=fixture();try{const e=artistIsolatedEnvironment(f.root,path.join(f.root,'ca.pem'),{PATH:process.env.PATH,API_KEY:'private',ACCESS_TOKEN:'private',NODE_OPTIONS:'--bad',PYTHONPATH:'private',PYTHONHOME:'private',HTTPS_PROXY:'private',NODE_EXTRA_CA_CERTS:'private',USERPROFILE:'private'});for(const k of ['API_KEY','ACCESS_TOKEN','NODE_OPTIONS','PYTHONPATH','PYTHONHOME','HTTPS_PROXY'])assert(!Object.hasOwn(e,k));for(const k of ['USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','HF_HOME','TORCH_HOME','TORCH_EXTENSIONS_DIR','CUDA_CACHE_PATH','TRITON_CACHE_DIR']){assert(e[k].startsWith(f.root+path.sep));assert(fs.statSync(e[k]).isDirectory());}assert.equal(e.PYTHONDONTWRITEBYTECODE,'1');assert.equal(e.HF_HUB_OFFLINE,'1');assert.equal(e.TRANSFORMERS_OFFLINE,'1');}finally{f.close();}});
test('hash helper reads exact original bytes and rejects missing/nonregular inputs',async()=>{const f=fixture();try{const p=path.join(f.root,'payload');fs.writeFileSync(p,Buffer.from([0,255,13,10,1]));const before=fs.readFileSync(p),r=await hashArtistFile(p);assert.equal(r.bytes,before.length);assert.equal(r.sha256,crypto.createHash('sha256').update(before).digest('hex'));assert.deepEqual(fs.readFileSync(p),before);await assert.rejects(hashArtistFile(f.root));await assert.rejects(hashArtistFile(p+'-absent'));}finally{f.close();}});
test('production source retains real native/ML pins, no fake model/resource completion or user window',()=>{const runner=fs.readFileSync(new URL('./run-windows-artist-native.mjs',import.meta.url),'utf8'),journey=fs.readFileSync(new URL('./windows-artist-journeys.cjs',import.meta.url),'utf8');for(const text of [runner,journey])assert(!/MockTransport|vi\.mock|mock\.method|windows-artist-contract-fixture/.test(text));assert(runner.includes('requirePristine:true'));assert(runner.includes('captureArtistInputs(o.python,o.assets)'));assert(runner.includes('Exact pinned'));assert(journey.includes("invoke('artistDetectiveVerifyRuntime')"));assert(journey.includes("invoke('artistDetectiveResume'"));assert(journey.includes("invoke('artistDetectiveDownloadStart')"));assert(journey.includes("installed.stage,'complete'"));assert(journey.includes("'actualRendererAppliedSelected' ")===false);assert(journey.includes('show:false'));assert(journey.includes('gpuIdle('));assert(!journey.includes('SendKeys'));assert(!runner.includes('npm install'));});

const gpuText=free=>`0, Hypothetical schema GPU, 616.92, 12227, ${free}\n`;
const sharedContexts='101, [N/A]\n202, 128\n';
const argumentFixture=()=>{const base=path.resolve('fixture');return ['--source',base,'--out',base+'-out','--source-sha','a'.repeat(40),'--python',path.join(base,'python.exe'),'--assets',path.join(base,'assets'),'--assets-archive',path.join(base,'assets.zip'),'--runtime-archive',path.join(base,'runtime.zip')];};
test('GPU resource sharing requires exact paired explicit opt-in; absent remains exclusive',()=>{
 const args=argumentFixture();assert.equal(parseWindowsArtistArguments(args)['gpu-resource-policy'],'exclusive');
 for(const policy of ['exclusive','shared'])assert.equal(parseWindowsArtistArguments([...args,'--gpu-resource-policy',policy])['gpu-resource-policy'],policy);
 for(const bad of [[...args,'--gpu-resource-policy'],[...args,'--gpu-resource-policy','false'],[...args,'--gpu-resource-policy','true'],[...args,'--gpu-resource-policy','SHARED'],[...args,'--gpu-resource-policy','unknown'],[...args,'--gpu-resource-policy','shared','--gpu-resource-policy','exclusive'],[...args,'--allow-shared-gpu','false']])assert.throws(()=>parseWindowsArtistArguments(bad));
});
test('shared resource parser preserves literal reported context count instead of claiming zero',()=>{
 for(const policy of [undefined,'exclusive'])assert.throws(()=>parseArtistGpu(gpuText(12000),sharedContexts,policy));
 const observed=parseArtistGpu(gpuText(12000),sharedContexts,'shared');
 assert.equal(observed.gpuResourcePolicy,'shared');assert.equal(observed.reportedContextCount,2);assert.equal(observed.otherComputeProcesses,null);assert.equal(observed.driver,'616.92');assert.equal(observed.freeMiB,12000);
 const empty=parseArtistGpu(gpuText(12000),'','shared');assert.equal(empty.reportedContextCount,0);assert.equal(empty.otherComputeProcesses,0);
});
for(const policy of ['exclusive','shared'])test(`${policy} preserves the 10240MiB minimum and rejects invalid GPU observations`,()=>{
 const contexts=policy==='shared'?sharedContexts:'';assert.equal(parseArtistGpu(gpuText(10240),contexts,policy).freeMiB,10240);
 for(const bad of [gpuText(10239),gpuText('NaN'),gpuText('Infinity'),gpuText(10240.5),'0, GPU, driver, Infinity, 12000','0, GPU, driver, 10000, 12000','0, GPU, , 12227, 12000','0, , driver, 12227, 12000','1, GPU, driver, 12227, 12000','0, GPU, driver, 12227, 12000, extra','0, GPU, driver, 12227, 12000\n1, GPU, driver, 12227, 12000'])assert.throws(()=>parseArtistGpu(bad,contexts,policy));
});
test('shared admission rejects malformed process query output, not just failed subprocesses',()=>{
 for(const bad of ['unknown','error: access denied','101','101, 128, extra','zero, 128','0, 128','-1, 128','1.5, 128','101, -1','101, NaN','101, Infinity','101, unknown','101, 1.5','No running processes found but query failed','101, [N/A]\n202, error'])assert.throws(()=>parseArtistGpu(gpuText(12000),bad,'shared'),bad);
 for(const policy of ['unknown','SHARED',true,null])assert.throws(()=>parseArtistGpu(gpuText(12000),'',policy));
});
