import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const mock=vi.hoisted(()=>({root:'',exec:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:()=>mock.root,getAppPath:()=>mock.root}}));
vi.mock('node:child_process',()=>({execFile:(...args:unknown[])=>mock.exec(...args)}));
let c:{python:string;assets:string;variant:'full'|'light'};
const success=(architecture='PE-Spatial-G14-448')=>'DETECTIVE_CHECK_OK:'+JSON.stringify({gpu:'fixture GPU',architecture,selfScore:1});
beforeEach(()=>{
 vi.resetModules();mock.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-persist-'));c={python:path.join(mock.root,'python.exe'),assets:path.join(mock.root,'assets'),variant:'full'};
 fs.mkdirSync(c.assets);fs.writeFileSync(c.python,'python');fs.writeFileSync(path.join(c.assets,'model.bin'),'model');fs.writeFileSync(path.join(c.assets,'manifest.json'),JSON.stringify({files:{'model.bin':{}}}));
 mock.exec.mockReset().mockImplementation((_e,_a,_o,cb)=>cb(null,{stdout:success(),stderr:''}));
});
afterEach(()=>fs.rmSync(mock.root,{recursive:true,force:true}));
const reload=async()=>{vi.resetModules();return import('./detective-runtime-check');};
it('remembers success across restart without launching Python again',async()=>{
 let m=await reload();expect((await m.validateDetectiveRuntime(c)).state).toBe('passed');m=await reload();
 expect(m.detectiveRuntimeValidation(c).state).toBe('passed');expect((await m.validateDetectiveRuntime(c)).state).toBe('passed');expect(mock.exec).toHaveBeenCalledTimes(1);
});
it('keeps full and light remembered independently across restart',async()=>{
 let m=await reload();await m.validateDetectiveRuntime(c);mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(null,{stdout:success('PE-Spatial-L14-448'),stderr:''}));await m.validateDetectiveRuntime({...c,variant:'light'});m=await reload();
 expect(m.detectiveRuntimeValidation(c).state).toBe('passed');expect(m.detectiveRuntimeValidation({...c,variant:'light'}).state).toBe('passed');expect(mock.exec).toHaveBeenCalledTimes(2);
});
it('invalidates a changed model and a changed Python executable',async()=>{
 let m=await reload();await m.validateDetectiveRuntime(c);fs.appendFileSync(path.join(c.assets,'model.bin'),'changed');m=await reload();expect(m.detectiveRuntimeValidation(c).state).toBe('unchecked');await m.validateDetectiveRuntime(c);fs.appendFileSync(c.python,'changed');m=await reload();expect(m.detectiveRuntimeValidation(c).state).toBe('unchecked');
});
it('forced failed recheck revokes a previous persisted success',async()=>{
 let m=await reload();await m.validateDetectiveRuntime(c);mock.exec.mockImplementation((_e,_a,_o,cb)=>cb(Error('CUDA unavailable')));expect((await m.validateDetectiveRuntime(c,true)).state).toBe('failed');m=await reload();expect(m.detectiveRuntimeValidation(c).state).toBe('unchecked');
});
it('missing model files prompt choosing the model directory instead of using cached success',async()=>{
 let m=await reload();await m.validateDetectiveRuntime(c);fs.unlinkSync(path.join(c.assets,'model.bin'));m=await reload();const result=m.detectiveRuntimeValidation(c);expect(result.state).toBe('failed');expect(result.message).toContain('使用已有模型目录');expect(mock.exec).toHaveBeenCalledTimes(1);
});
it('missing Python prompts choosing the runtime',async()=>{
 const m=await reload();fs.unlinkSync(c.python);const result=await m.validateDetectiveRuntime(c);expect(result.state).toBe('failed');expect(result.message).toContain('使用已有运行环境');expect(mock.exec).not.toHaveBeenCalled();
});
it('ignores corrupt persisted records and checks normally',async()=>{
 const file=path.join(mock.root,'artist-detective-validation.json');fs.writeFileSync(file,'{bad');const m=await reload();expect(m.detectiveRuntimeValidation(c).state).toBe('unchecked');expect((await m.validateDetectiveRuntime(c)).state).toBe('passed');
});
