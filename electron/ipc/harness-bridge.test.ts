import {afterEach,describe,it,expect,vi} from 'vitest';
import os from 'node:os';import path from 'node:path';import fs from 'node:fs/promises';
import {startHarnessBridge} from './harness-bridge';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-bridge-test-'));
  cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
  const execute=vi.fn(async()=>({ok:true,title:'test',output:'done'}));
  const options={journal:root,tools:['langbai_generate_image'],execute};
  const bridge=await startHarnessBridge(options);cleanup.push(bridge.close);
  const send=(body:unknown,headers:Record<string,string>={})=>fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:`Bearer ${bridge.env.STUDIO_BRIDGE_TOKEN}`,...headers},body:JSON.stringify(body)});
  return{send,execute,options,bridge};
}
const request={tool:'langbai_generate_image',args:{positivePrompt:'forest'},callId:'call-1',sessionId:'session-1'};
describe('Studio bridge authorization and paid-job deduplication',()=>{
  it('rejects unknown credentials, web origins and tool names',async()=>{
    const {send,execute}=await setup();
    expect((await send(request,{Authorization:'Bearer wrong'})).status).toBe(403);
    expect((await send(request,{Origin:'http://evil.test'})).status).toBe(403);
    expect((await send({...request,tool:'exec'})).status).toBe(400);expect(execute).not.toHaveBeenCalled();
  });
  it('executes duplicate calls once and strips untrusted promptLocks',async()=>{
    const {send,execute}=await setup();
    await send({...request,promptLocks:{stylePrompt:'attacker'}});await send(request);
    expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0]).toEqual([request]);
    expect((await send({...request,args:{positivePrompt:'other'}})).status).toBe(409);
  });
  it('does not replay an uncertain paid job after process restart',async()=>{
    const {send,execute,options}=await setup();execute.mockRejectedValueOnce(new Error('connection lost'));
    expect((await send(request)).status).toBe(500);
    const restarted=await startHarnessBridge(options);cleanup.push(restarted.close);
    const result=await fetch(restarted.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:`Bearer ${restarted.env.STUDIO_BRIDGE_TOKEN}`},body:JSON.stringify(request)});
    expect(result.status).toBe(409);expect(execute).toHaveBeenCalledTimes(1);
  });
});
