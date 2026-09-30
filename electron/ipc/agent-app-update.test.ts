import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createAppUpdateActions,type AppUpdateAdapter} from './agent-app-update';
import {startHarnessBridge} from './harness-bridge';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
let root:string;
const clean:Array<()=>Promise<unknown>>=[];
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-app-update-'));});
afterEach(async()=>{for(const f of clean.splice(0).reverse())await f();await fs.rm(root,{recursive:true,force:true});});
function fixture(){
 let current='2.4.3',leased=false;
 const plan={version:'2.4.4',bytes:4,sha512:'fixture-hash',sourceUrl:'https://github.com/2786886095/novelai-image-desktop/releases/download/v2.4.4/setup.exe'};
 const adapter:AppUpdateAdapter={currentVersion:()=>current,supported:()=>true,busy:()=>leased,
  plan:vi.fn(async()=>plan),reserve:vi.fn(()=>{if(leased)throw Error('busy');leased=true;}),release:vi.fn(()=>{leased=false;}),
  download:vi.fn(async(_p,_s,progress)=>{progress(100);}),
  install:vi.fn(async(_p,_s,onStarted)=>{await onStarted();}),log:vi.fn()};
 const approve=vi.fn(async()=>true),api=createAppUpdateActions(root,adapter,approve,100);
 clean.push(()=>api.cancel().catch(()=>{}));
 const request=(action:string,revision?:string):AgentToolBridgeRequest=>({tool:'langbai_software_action',callId:action,sessionId:'s',args:{action,...(revision?{expectedRevision:revision}:{})}});
 const check=async()=>{const result=await api.execute(request('app.update.check'));expect(result.ok).toBe(true);return String(result.data!.revision);};
 return {api,adapter,approve,plan,request,check,setCurrent:(s:string)=>{current=s;}};
}
it('checks metadata without downloading; confirms once and only installs after durable response handoff',async()=>{
 const f=fixture(),rev=await f.check();expect(f.adapter.download).not.toHaveBeenCalled();
 const req=f.request('app.update.install',rev),reply=await f.api.execute(req);
 expect(reply.ok).toBe(true);expect(f.approve).toHaveBeenCalledTimes(1);expect(f.adapter.download).not.toHaveBeenCalled();
 const saved=JSON.parse(await fs.readFile(path.join(root,'app-update-operation.json'),'utf8'));expect(saved.state).toBe('queued');
 f.api.afterResponse(req,reply,true);f.api.afterResponse(req,reply,true);await f.api.settled();
 expect(f.adapter.download).toHaveBeenCalledTimes(1);expect(f.adapter.install).toHaveBeenCalledTimes(1);expect(f.api.operation?.state).toBe('installer_started');
 expect(f.api.operation?.state).not.toBe('completed');
 f.setCurrent('2.4.4');const restart=createAppUpdateActions(root,f.adapter,f.approve);await restart.initialize();expect(restart.operation?.state).toBe('completed');
});
it('does not download for denied, stale, unknown-field or undelivered requests',async()=>{
 const f=fixture(),rev=await f.check();f.approve.mockResolvedValue(false);
 expect((await f.api.execute(f.request('app.update.install',rev))).ok).toBe(false);
 f.approve.mockResolvedValue(true);
 expect((await f.api.execute(f.request('app.update.install','stale'))).ok).toBe(false);
 const forged=f.request('app.update.install',rev);forged.args.confirmed=true;expect((await f.api.execute(forged)).ok).toBe(false);
 const req=f.request('app.update.install',rev),reply=await f.api.execute(req);f.api.afterResponse(req,reply,false);await f.api.settled();
 expect(f.adapter.download).not.toHaveBeenCalled();expect(f.api.operation?.state).toBe('interrupted');expect(f.adapter.busy()).toBe(false);
});
it('reports download failure without installation; startup never automatically retries',async()=>{
 const f=fixture(),rev=await f.check();vi.mocked(f.adapter.download).mockRejectedValue(Error('digest mismatch'));
 const req=f.request('app.update.install',rev),reply=await f.api.execute(req);f.api.afterResponse(req,reply,true);await f.api.settled();
 expect(f.api.operation?.state).toBe('failed');expect(f.adapter.install).not.toHaveBeenCalled();
 const restart=createAppUpdateActions(root,f.adapter,f.approve);await restart.initialize();expect(restart.operation?.state).toBe('failed');expect(f.adapter.download).toHaveBeenCalledTimes(1);
});
it('supports stopping a progressing download without a second confirmation or install',async()=>{
 const f=fixture(),rev=await f.check();let began!:()=>void;const started=new Promise<void>(r=>began=r);
 vi.mocked(f.adapter.download).mockImplementation(async(_p,signal)=>{began();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});
 const req=f.request('app.update.install',rev),reply=await f.api.execute(req);f.api.afterResponse(req,reply,true);await started;
 const stop=await f.api.execute(f.request('app.update.cancel'));expect(stop.ok).toBe(true);await f.api.settled();
 expect(f.api.operation?.state).toBe('interrupted');expect(f.adapter.install).not.toHaveBeenCalled();expect(f.approve).toHaveBeenCalledTimes(1);
});
it('revalidates approval and times out missing handoff without executing',async()=>{
 const f=fixture(),rev=await f.check();f.approve.mockImplementationOnce(async()=>{f.setCurrent('2.4.5');return true;});
 expect((await f.api.execute(f.request('app.update.install',rev))).ok).toBe(false);
 f.setCurrent('2.4.3');const fresh=await f.check();expect((await f.api.execute(f.request('app.update.install',fresh))).ok).toBe(true);
 await new Promise(r=>setTimeout(r,150));await f.api.settled();expect(f.api.operation?.state).toBe('interrupted');expect(f.adapter.download).not.toHaveBeenCalled();
});
it('actual HTTP journal replay and host restart do not download/install twice',async()=>{
 const f=fixture(),rev=await f.check();let bridge=await startHarnessBridge({journal:path.join(root,'journal'),tools:['langbai_software_action'],execute:f.api.execute,afterResponse:f.api.afterResponse});clean.push(()=>bridge.close());
 const req=f.request('app.update.install',rev);
 const send=()=>fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:`Bearer ${bridge.env.STUDIO_BRIDGE_TOKEN}`},body:JSON.stringify(req)}).then(r=>r.json());
 const first=await send();expect(first.ok).toBe(true);await new Promise(r=>setTimeout(r,40));await f.api.settled();expect(await send()).toEqual(first);
 await bridge.close();f.setCurrent('2.4.4');const restarted=createAppUpdateActions(root,f.adapter,f.approve);await restarted.initialize();
 bridge=await startHarnessBridge({journal:path.join(root,'journal'),tools:['langbai_software_action'],execute:restarted.execute,afterResponse:restarted.afterResponse});
 expect(await send()).toEqual(first);expect(restarted.operation?.state).toBe('completed');expect(f.approve).toHaveBeenCalledTimes(1);expect(f.adapter.download).toHaveBeenCalledTimes(1);
});
