import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({deps:vi.fn(),help:vi.fn(),probe:vi.fn()}));
vi.mock('./local-media-protocol',()=>({toLocalMediaUrl:()=>{throw new Error('NO_MEDIA_IN_DIRECTORY_TEST');}}));
vi.mock('./comfyui-dependencies',async original=>({...await original<typeof import('./comfyui-dependencies')>(),probeComfyDependencies:mocks.deps}));
vi.mock('./comfyui-install',async original=>({...await original<typeof import('./comfyui-install')>(),probeComfyHelp:mocks.help}));
vi.mock('./comfyui-probe',async original=>({...await original<typeof import('./comfyui-probe')>(),probeComfy:mocks.probe}));
import { ComfyLocalService } from './comfyui-service';
import type { ComfyLocalServiceOptions } from './comfyui-service';
import type { ComfyInstallInspection } from '../../src/comfyui/contract';
const roots:string[]=[],services:ComfyLocalService[]=[];
async function setup(){
 const temp=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'comfy-directory-test-'));roots.push(root);
 const source=path.join(root,'ComfyUI'),exe=process.platform==='win32'?'python.exe':'python';await fs.mkdir(source);await fs.writeFile(path.join(source,'main.py'),'# STATIC NEVER EXECUTED');
 // The real path preflight checks X_OK on POSIX; the dependency/help probes below remain mocked.
 for(const name of ['python','.ext']){await fs.mkdir(path.join(root,name));const python=path.join(root,name,exe);await fs.writeFile(python,'STATIC NEVER EXECUTED');await fs.chmod(python,0o755);}
 const legacy=path.join(root,'python',exe),ext=path.join(root,'.ext',exe);
 mocks.probe.mockResolvedValue({kind:'free',target:{host:'127.0.0.1',port:8188,baseUrl:'http://127.0.0.1:8188'}});
 mocks.help.mockImplementation(async (install:ComfyInstallInspection)=>({...install,helpProbe:'passed',supportedFlags:['--port'],checkedAt:'2026-10-21T00:00:00Z'}));
 mocks.deps.mockImplementation(async (install:ComfyInstallInspection)=>metadata(install.python===ext?'satisfied':'mismatch'));
 const options:ComfyLocalServiceOptions={userData:path.join(root,'profile'),defaultOutputDirectory:()=>path.join(root,'output'),chooseDirectory:async()=>source,choosePython:async()=>legacy,chooseWorkflowFile:async()=>null,parseWorkflow:()=>{throw new Error('NO_WORKFLOW');},analyze:()=>{throw new Error('NO_ANALYSIS');},buildArgs:()=>[],revealResult:()=>undefined,openDirectory:async()=>undefined};
 const service=new ComfyLocalService(options);services.push(service);return {root,source,legacy,ext,service};
}
function metadata(status:'satisfied'|'mismatch'|'missing'|'unknown'){return {pythonVersion:'3.11',dependencyChecks:[{name:'fixture-dependency',required:'==2.0',installed:status==='missing'?null:status==='satisfied'?'2.0':'1.0',status}],dependencyProbeMessage:null};}
afterEach(async()=>{for(const s of services.splice(0))await s.shutdown();for(const root of roots.splice(0)){if(path.dirname(root)!==await fs.realpath(os.tmpdir())||!path.basename(root).startsWith('comfy-directory-test-'))throw new Error('UNSAFE_TEST_CLEANUP');await fs.rm(root,{recursive:true,force:true});}vi.clearAllMocks();});
it('one main-directory selection detects the bundle .ext interpreter, auto port and safety off without running a runtime',async()=>{const f=await setup(),result=await f.service.chooseInstallDirectory();expect(result?.install).toMatchObject({root:f.source,python:f.ext,pythonSelection:{mode:'auto'},helpProbe:'passed'});expect(result?.launch).toMatchObject({portMode:'auto',safeMode:false,extraArgs:[]});expect(mocks.deps).toHaveBeenCalledTimes(2);expect(mocks.help).toHaveBeenCalledOnce();expect(mocks.help.mock.calls[0][0].python).toBe(f.ext);});
it.each(['mismatch','missing'] as const)('reselecting the same root replaces a confirmed %s manual runtime with this bundle compatible environment',async status=>{const f=await setup();await f.service.chooseInstallDirectory();mocks.deps.mockImplementation(async (install:ComfyInstallInspection)=>metadata(install.python===f.ext?'satisfied':status));await f.service.choosePython();expect((await f.service.configuredInstall())?.pythonSelection?.mode).toBe('manual');const result=await f.service.chooseInstallDirectory();expect(result?.install).toMatchObject({python:f.ext,pythonSelection:{mode:'auto'}});});
it.each(['satisfied','unknown'] as const)('a saved %s manual runtime is preserved, not silently replaced',async status=>{const f=await setup();await f.service.chooseInstallDirectory();mocks.deps.mockImplementation(async()=>metadata(status));await f.service.choosePython();const result=await f.service.chooseInstallDirectory();expect(result?.install).toMatchObject({python:f.legacy,pythonSelection:{mode:'manual'}});});
it('if no compatible auto candidate exists, the inspected manual diagnostic is retained',async()=>{const f=await setup();await f.service.chooseInstallDirectory();mocks.deps.mockImplementation(async()=>metadata('mismatch'));await f.service.choosePython();const result=await f.service.chooseInstallDirectory();expect(result?.install).toMatchObject({python:f.legacy,pythonSelection:{mode:'manual'},dependencyChecks:[{status:'mismatch'}]});});
