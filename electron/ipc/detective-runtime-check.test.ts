import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const mock=vi.hoisted(()=>({root:'',exec:vi.fn()}));
vi.mock('electron',()=>({app:{getAppPath:()=>mock.root}}));
vi.mock('node:child_process',()=>({execFile:(...args:unknown[])=>mock.exec(...args)}));
import {detectiveRuntimeValidation,validateDetectiveRuntime} from './detective-runtime-check';
let c:{python:string;assets:string};
const ok='DETECTIVE_CHECK_OK:'+JSON.stringify({python:'3.12',torch:'2.11',cuda:'12.8',gpu:'fixture GPU',architecture:'fixture model',selfScore:1});
beforeEach(()=>{
 mock.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-runtime-'));c={python:path.join(mock.root,'python.exe'),assets:path.join(mock.root,'assets')};
 fs.mkdirSync(c.assets);fs.writeFileSync(c.python,'python');fs.writeFileSync(path.join(c.assets,'model.bin'),'model');
 fs.writeFileSync(path.join(c.assets,'manifest.json'),JSON.stringify({files:{'model.bin':{}}}));
 // promisify on a mock needs the stdout/stderr named-result contract.
 mock.exec.mockReset().mockImplementation((_exe,_args,_options,cb)=>cb(null,{stdout:ok,stderr:''}));
});
afterEach(()=>fs.rmSync(mock.root,{recursive:true,force:true}));
it('requires a successful real-process marker, caches and invalidates changed model files',async()=>{
 expect(detectiveRuntimeValidation(c).state).toBe('unchecked');
 expect((await validateDetectiveRuntime(c)).state).toBe('passed');
 await validateDetectiveRuntime(c);expect(mock.exec).toHaveBeenCalledTimes(1);
 const [,args,options]=mock.exec.mock.calls[0];expect(args).toContain('-I');expect(options).toMatchObject({windowsHide:true,timeout:600000});
 fs.appendFileSync(path.join(c.assets,'model.bin'),'changed');expect(detectiveRuntimeValidation(c).state).toBe('unchecked');
});
it('reports CUDA/import failures without falsely marking loaded',async()=>{
 mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(new Error('CUDA unavailable')));
 const v=await validateDetectiveRuntime(c);expect(v.state).toBe('failed');expect(v.message).toContain('CUDA unavailable');
});
it('rejects exit-zero without scoring evidence',async()=>{
 mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(null,{stdout:'files exist',stderr:''}));
 expect((await validateDetectiveRuntime(c)).state).toBe('failed');
});
it('rejects missing and escaping files before starting Python',async()=>{
 fs.unlinkSync(path.join(c.assets,'model.bin'));expect((await validateDetectiveRuntime(c)).state).toBe('failed');
 fs.writeFileSync(path.join(c.assets,'manifest.json'),JSON.stringify({files:{'../python.exe':{}}}));
 expect((await validateDetectiveRuntime(c)).state).toBe('failed');expect(mock.exec).not.toHaveBeenCalled();
});
it('deduplicates checks and rejects model changes during loading',async()=>{
 let finish:Function=()=>{};mock.exec.mockImplementation((_e,_a,_o,cb)=>{finish=cb;});
 const first=validateDetectiveRuntime(c),second=validateDetectiveRuntime(c);
 expect(detectiveRuntimeValidation(c).state).toBe('checking');expect(first).toBe(second);
 fs.appendFileSync(c.python,'changed');finish(null,{stdout:ok,stderr:''});
 expect((await first).state).toBe('failed');
});
it('keeps full and light results separate and retains both successful checks',async()=>{
 const success=(architecture:string)=>'DETECTIVE_CHECK_OK:'+JSON.stringify({gpu:'fixture GPU',architecture,selfScore:1});
 mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(null,{stdout:success('PE-Spatial-G14-448'),stderr:''}));
 expect((await validateDetectiveRuntime({...c,variant:'full'})).state).toBe('passed');
 expect(detectiveRuntimeValidation({...c,variant:'light'}).state).toBe('unchecked');
 expect((await validateDetectiveRuntime({...c,variant:'light'})).state).toBe('failed'); // full model is not light
 expect(detectiveRuntimeValidation({...c,variant:'full'}).state).toBe('passed');
 mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(null,{stdout:success('PE-Spatial-L14-448'),stderr:''}));
 expect((await validateDetectiveRuntime({...c,variant:'light'},true)).state).toBe('passed');
 expect(detectiveRuntimeValidation({...c,variant:'full'}).state).toBe('passed');
});
