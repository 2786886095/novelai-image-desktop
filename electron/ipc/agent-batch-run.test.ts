import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createAgentBatchRun} from './agent-batch-run';
import {createSessionControls} from './harness-session-controls';
import {authorizeAgentBatchRequest} from './batch-run-authorization';
import {createBatchGenerationQueue,type BatchTask} from '../../src/batch/generation-queue';
import {createBatchProjectStore} from '../../src/batch/project-store';
import {createDefaultBatchRedraw,DEFAULT_PARAMS,type BatchRedrawRequest,type BatchRedrawItem} from '../../src/types';
import type {AgentToolBridgeRequest} from '../../src/agent/types';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
async function fixture(count=1,handoffMs=30000){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'batch-host-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 let project={...createDefaultBatchRedraw(DEFAULT_PARAMS),groupName:'fixture',candidateCount:count,items:['a','b'].map(id=>({id,name:id,base64:'eA==',width:64,height:64,prompt:'forest '+id,strength:null,overrideParams:false,params:{},status:'pending',candidates:[]})) as BatchRedrawItem[]},busy=false;
 const store=createBatchProjectStore({get:()=>({project,busy}),update:p=>{project=p;},busy:b=>{busy=b;}});
 const globalStop=vi.fn(),sessions=createSessionControls(path.join(root,'sessions'),()=>[],globalStop),approve=vi.fn(async(_r:AgentToolBridgeRequest)=>true);
 let source='source-a',n=0;const hooks={request:vi.fn((r:BatchRedrawRequest)=>r),beforeGuard:vi.fn(async()=>{}),network:vi.fn(async()=>{})};
 const generate=vi.fn(async(request:BatchRedrawRequest)=>{const guard=await authorizeAgentBatchRequest(hooks.request(request));await hooks.beforeGuard();guard?.();await hooks.network();const id='image-'+ ++n;return {ok:true,message:'saved',items:[{id,filePath:id+'.png',fileUrl:'fixture://'+id,date:'today',createdAt:'today',groupId:'g',params:DEFAULT_PARAMS,actualSeed:1,model:'fixture',width:64,height:64}]};});
 const cancelNative=vi.fn(async(_id:string)=>{}),waitNative=vi.fn(async(_id:string)=>{});
 const queue=createBatchGenerationQueue({store,storage,prepare:async()=>({binding:source,provider:'novelai'}),generate,cancel:cancelNative});
 const ask=vi.fn(async(args:Record<string,unknown>):Promise<Record<string,unknown>>=>{const current=store.read();switch(args.action){
  case '_batch.snapshot':if(args.expectedRevision!==current.revision)throw Error('revision changed');return {project:current.project};
  case '_batch.generation.preview':return queue.preview(args.tasks as BatchTask[],String(args.expectedRevision));
  case '_batch.generation.launch':return queue.launch(args.tasks as BatchTask[],{runId:String(args.runId),expectedRevision:String(args.expectedRevision)});
  case '_batch.generation.status':return {...queue.getSnapshot(),active:queue.active};
  case '_batch.generation.stop':return queue.stop(String(args.runId));
  default:throw Error('unexpected '+args.action);
 }});
 const adapter={ask,wait:async(id:string)=>({...await queue.wait(id)}),source:()=>source,cancelNative,waitNative};const host=createAgentBatchRun(root,adapter,sessions,approve,handoffMs);await host.initialize;cleanup.push(()=>host.close());
 const request=():AgentToolBridgeRequest=>({tool:'langbai_software_action',sessionId:'s1',callId:'call1',args:{action:'batch.generation.start',mode:'all',itemIds:[],expectedRevision:store.read().revision}});
 const policy=(mode:'auto'|'confirm',limit=0)=>sessions.execute({tool:'studio_generation_policy',sessionId:'s1',args:{mode,limit}});
 const status=()=>host.execute({tool:'langbai_software_action',sessionId:'s1',args:{action:'batch.generation.status'}});
 async function start(){const req=request(),result=await host.execute(req);expect(result.ok,result.output).toBe(true);host.afterResponse(req,result,true);await host.settled();return result;}
 return {root,host,adapter,request,start,status,policy,sessions,globalStop,approve,store,queue,generate,hooks,cancelNative,waitNative,source:(s:string)=>{source=s;}};
}
it('default automatic batch uses a durable handoff and real shared queue without extra confirmation',async()=>{const f=await fixture(2),req=f.request(),result=await f.host.execute(req);expect(result.ok,result.output).toBe(true);expect(f.generate).not.toHaveBeenCalled();expect(JSON.parse(await fs.readFile(path.join(f.root,'batch-run.json'),'utf8'))).toMatchObject({phase:'queued',total:4,submitted:0});f.host.afterResponse(req,result,true);f.host.afterResponse(req,result,true);await f.host.settled();expect(f.generate).toHaveBeenCalledTimes(4);expect(f.approve).not.toHaveBeenCalled();expect(f.store.read().project.items.map(i=>i.candidates.length)).toEqual([2,2]);expect((await f.status()).data).toMatchObject({phase:'completed',operation:{submitted:4,done:4,phase:'completed'}});});
it('one Agent confirmation covers twelve batch images',async()=>{const f=await fixture(6);await f.policy('confirm');await f.start();expect(f.approve).toHaveBeenCalledOnce();expect(f.approve.mock.calls[0][0].args).toMatchObject({plannedImages:12,action:'batch.generation.start'});expect(f.generate).toHaveBeenCalledTimes(12);});
it('lost handoff receipt never launches and releases authorization',async()=>{const f=await fixture(),req=f.request(),res=await f.host.execute(req);f.host.afterResponse(req,res,false);await f.host.settled();expect(f.generate).not.toHaveBeenCalled();expect(f.host.busy).toBe(false);expect((await f.status()).data).toMatchObject({operation:{phase:'interrupted'}});});
it('expired handoff never launches even if delivery arrives later',async()=>{const f=await fixture(1,15),req=f.request(),res=await f.host.execute(req);await f.host.settled();f.host.afterResponse(req,res,true);expect(f.generate).not.toHaveBeenCalled();expect((await f.status()).data).toMatchObject({operation:{phase:'interrupted'}});});
it('source changing during approval prevents any submission',async()=>{const f=await fixture();await f.policy('confirm');f.approve.mockImplementationOnce(async()=>{f.source('changed');return true;});const res=await f.host.execute(f.request());expect(res.ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();expect(f.host.busy).toBe(false);});
it('final guard stops submission if source changes after consuming an authorized request',async()=>{const f=await fixture();f.hooks.beforeGuard.mockImplementationOnce(async()=>{f.source('changed');});await f.start();expect(f.hooks.network).not.toHaveBeenCalled();expect(f.generate).toHaveBeenCalledOnce();expect((await f.status()).data).toMatchObject({phase:'failed'});});
it('edited request not matching approved snapshot is rejected before network',async()=>{const f=await fixture();f.hooks.request.mockImplementationOnce(r=>({...r,strength:0.999}));await f.start();expect(f.hooks.network).not.toHaveBeenCalled();expect((await f.status()).data).toMatchObject({phase:'failed'});});
it('wrong session cannot stop an owned batch; owner cancellation retains completed response',async()=>{const f=await fixture(),gate=deferred<void>();f.hooks.network.mockImplementationOnce(()=>gate.promise);const req=f.request(),res=await f.host.execute(req);f.host.afterResponse(req,res,true);await vi.waitFor(()=>expect(f.hooks.network).toHaveBeenCalledOnce());const id=(res.data as {id:string}).id;const wrong=await f.host.execute({tool:'langbai_software_action',sessionId:'s2',args:{action:'batch.generation.stop',runId:id}});expect(wrong.ok).toBe(false);const own=await f.host.execute({tool:'langbai_software_action',sessionId:'s1',args:{action:'batch.generation.stop',runId:id}});expect(own.ok).toBe(true);gate.resolve();await f.host.settled();expect(f.generate).toHaveBeenCalledOnce();expect(f.store.read().project.items[0].candidates).toHaveLength(1);expect(f.globalStop).not.toHaveBeenCalled();expect(f.cancelNative).toHaveBeenCalledWith(id);});
it('insufficient configured allowance and stale project revision reject before approval',async()=>{const f=await fixture(2);await f.policy('auto',1);expect((await f.host.execute(f.request())).ok).toBe(false);await f.policy('auto',0);const req=f.request();f.store.update(p=>({...p,groupName:'new'}));expect((await f.host.execute(req)).ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();});
it('declining the single confirmation leaves inputs and previous images intact',async()=>{const f=await fixture();await f.policy('confirm');f.approve.mockResolvedValueOnce(false);expect((await f.host.execute(f.request())).ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();expect(f.store.read().project.items).toHaveLength(2);});
it('missing call id cannot start an unjournaled batch',async()=>{const f=await fixture(),req=f.request();delete req.callId;expect((await f.host.execute(req)).ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();});
