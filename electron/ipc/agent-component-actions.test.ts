import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createComponentActions,type ComponentAdapter} from './agent-component-actions';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
import type {HarnessSnapshot} from '../../src/harness-types';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function setup(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'component-action-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 const state:HarnessSnapshot={phase:'running',version:'1.0.0',logs:[],dataDirectory:root};
 const asset={version:'1.1.0',bytes:42,tag:'v1.1.0',asset:{name:'component.zip',url:'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/123',size:42,digest:'sha256:'+'a'.repeat(64)}};
 const adapter:ComponentAdapter={snapshot:()=>state,query:vi.fn(async()=>asset),stop:vi.fn(async()=>{state.phase='stopped';}),prepare:vi.fn(async()=>({status:'ready',kind:'component',token:'prepared',version:asset.version,message:'ready'})),apply:vi.fn(async()=>{state.version=asset.version;}),uninstall:vi.fn(async()=>{state.version=null;}),log:vi.fn()};
 const approve=vi.fn(async(_r:AgentToolBridgeRequest)=>true);
 const actions=createComponentActions(root,adapter,approve,100);
 cleanup.push(actions.cancel);
 let serial=0;
 const request=(action:string,extra:Record<string,unknown>={}):AgentToolBridgeRequest=>({tool:'langbai_software_action',callId:'c'+(++serial),sessionId:'session',args:{action,...extra}});
 const revision=async()=>((await actions.execute(request('component.check'))).data as {revision:string}).revision;
 return{root,state,asset,adapter,approve,actions,request,revision};
}
it('queues after one approval, executes only after the reply, preserves a durable terminal receipt, and never replays',async()=>{
 const {root,actions,adapter,approve,request,revision}=await setup();
 const req=request('component.update',{expectedRevision:await revision()});const res=await actions.execute(req);
 expect(res.ok).toBe(true);expect(actions.operation?.state).toBe('queued');expect(adapter.stop).not.toHaveBeenCalled();
 actions.afterResponse(req,res,true);actions.afterResponse(req,res,true);await actions.settled();
 expect(actions.operation?.state).toBe('completed');expect(approve).toHaveBeenCalledTimes(1);expect(adapter.prepare).toHaveBeenCalledTimes(1);expect(adapter.apply).toHaveBeenCalledTimes(1);
 const restart=createComponentActions(root,adapter,approve);await restart.initialize();restart.afterResponse(req,res,true);
 expect(restart.operation?.state).toBe('completed');expect(adapter.apply).toHaveBeenCalledTimes(1);
});
it('uninstalls without fetching/downloading assets; requires an explicit Agent confirmation',async()=>{
 const {actions,adapter,approve,request}=await setup();
 const read=await actions.execute(request('component.status'));const req=request('component.uninstall',{expectedRevision:(read.data as any).revision});
 const res=await actions.execute(req);actions.afterResponse(req,res,true);await actions.settled();
 expect(actions.operation?.state).toBe('completed');expect(adapter.query).not.toHaveBeenCalled();expect(adapter.uninstall).toHaveBeenCalledTimes(1);expect(adapter.prepare).not.toHaveBeenCalled();
 expect(approve.mock.calls[0][0].args).toMatchObject({keepConversations:true,downloadBytes:0});
});
it('disconnect and missing handoff expire without stopping the Agent',async()=>{
 const {actions,adapter,request,revision}=await setup();
 let req=request('component.update',{expectedRevision:await revision()}),res=await actions.execute(req);
 actions.afterResponse(req,res,false);await actions.settled();expect(actions.operation?.state).toBe('interrupted');
 req=request('component.update',{expectedRevision:await revision()});res=await actions.execute(req);
 // Wait for the durable terminal receipt, not a guessed filesystem completion time.
 await vi.waitFor(()=>{expect(actions.operation?.state).toBe('interrupted');expect(actions.busy).toBe(false);},{timeout:5000});expect(adapter.stop).not.toHaveBeenCalled();
 actions.afterResponse(req,res,true);expect(adapter.stop).not.toHaveBeenCalled();
});
it('restart records interrupted instead of silently resuming a queued operation',async()=>{
 const {root,actions,adapter,approve,request,revision}=await setup();
 await actions.execute(request('component.update',{expectedRevision:await revision()}));
 const restart=createComponentActions(root,adapter,approve);await restart.initialize();
 expect(restart.operation?.state).toBe('interrupted');expect(adapter.stop).not.toHaveBeenCalled();
});
it('rejects extra paths, changed revision and cancelled approval without changing the installed component',async()=>{
 const {actions,adapter,approve,request,revision}=await setup();const rev=await revision();
 expect((await actions.execute(request('component.update',{expectedRevision:rev,url:'evil'}))).ok).toBe(false);
 expect((await actions.execute(request('component.update',{expectedRevision:'stale'}))).ok).toBe(false);
 approve.mockResolvedValue(false);expect((await actions.execute(request('component.update',{expectedRevision:rev}))).ok).toBe(false);
 expect(adapter.stop).not.toHaveBeenCalled();expect(actions.busy).toBe(false);
});
it('status reads do not discard the pending-approval cancellation handle; a second mutation is rejected',async()=>{
 const {actions,adapter,approve,request,revision}=await setup();const rev=await revision();
 approve.mockImplementation(r=>new Promise(resolve=>r.signal!.addEventListener('abort',()=>resolve(false),{once:true})));
 const work=actions.execute(request('component.update',{expectedRevision:rev}));
 await vi.waitFor(()=>expect(approve).toHaveBeenCalledTimes(1));
 expect((await actions.execute(request('component.status'))).ok).toBe(true);
 expect((await actions.execute(request('component.uninstall',{expectedRevision:rev}))).ok).toBe(false);
 await actions.cancel();expect((await work).ok).toBe(false);expect(adapter.stop).not.toHaveBeenCalled();expect(actions.busy).toBe(false);
});
it.each(['prepare','apply','uninstall'] as const)('does not report completed when %s fails or returns a swallowed error',async stage=>{
 const {actions,adapter,request,revision,state}=await setup();
 if(stage==='prepare')adapter.prepare=vi.fn(async()=>({status:'blocked',kind:'component',message:'incompatible'}));
 if(stage==='apply')adapter.apply=vi.fn(async()=>{state.phase='error';});
 if(stage==='uninstall')adapter.uninstall=vi.fn(async()=>{state.phase='error';});
 const req=request(stage==='uninstall'?'component.uninstall':'component.update',{expectedRevision:await revision()});const res=await actions.execute(req);
 actions.afterResponse(req,res,true);await actions.settled();expect(actions.operation?.state).toBe('failed');expect(actions.busy).toBe(false);
});
it('pins the asset shown for approval and rejects a different version from preparation',async()=>{
 const {actions,adapter,request,revision,approve,asset}=await setup();
 adapter.prepare=vi.fn(async()=>({status:'ready',kind:'component',token:'wrong',version:'99.0.0',message:'ready'}));
 const req=request('component.update',{expectedRevision:await revision()}),res=await actions.execute(req);
 expect(approve.mock.calls[0][0].args).toMatchObject({version:asset.version,downloadBytes:42,sha256:asset.asset.digest});
 actions.afterResponse(req,res,true);await actions.settled();expect(adapter.prepare).toHaveBeenCalledWith(asset,false);expect(adapter.apply).not.toHaveBeenCalled();expect(actions.operation?.state).toBe('failed');
});
it('rejects a corrupted operation receipt rather than discarding it and executing a new task',async()=>{
 const {root,adapter,approve,request}=await setup();await fs.writeFile(path.join(root,'component-operation.json'),'{}');
 const restart=createComponentActions(root,adapter,approve);const res=await restart.execute(request('component.status'));
 expect(res.ok).toBe(false);expect(res.output).toContain('损坏');expect(adapter.stop).not.toHaveBeenCalled();
});
