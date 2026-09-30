import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createAgentComicRun,comicSourceBinding} from './agent-comic-run';
import {createSessionControls} from './harness-session-controls';
import {authorizeAgentComicRequest,registerAgentComicRun} from './comic-run-authorization';
import {createImageApprovals} from './harness-image-approval';
import {createComicGenerationQueue,type ComicQueueTask} from '../../src/comic/generation-queue';
import {createComicProjectStore} from '../../src/comic/project-store';
import {createTagComicPanel} from '../../src/comic/tag-comic';
import {DEFAULT_PARAMS,type TagComicGenerateRequest,type AppSettings} from '../../src/types';
import type {AgentToolBridgeRequest} from '../../src/agent/types';

const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
async function fixture(count=1,handoffMs=30000){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'comic-host-test-'));
 cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const store=createComicProjectStore({storage,params:()=>DEFAULT_PARAMS});
 store.update(p=>({...p,initialGenerationCount:count,panels:[createTagComicPanel('forest',1),createTagComicPanel('sea',2)]}));
 const globalStop=vi.fn(),sessions=createSessionControls(path.join(root,'sessions'),()=>[],globalStop),approve=vi.fn(async(_request:AgentToolBridgeRequest)=>true);
 let source='source-a',n=0;
 const hooks={request:vi.fn((r:TagComicGenerateRequest)=>r),beforeGuard:vi.fn(async()=>{}),afterSaved:vi.fn(async()=>{}),network:vi.fn(async()=>{})};
 const generate=vi.fn(async(request:TagComicGenerateRequest)=>{
  const guard=await authorizeAgentComicRequest(hooks.request(request));await hooks.beforeGuard();guard?.();await hooks.network();
  const id='image-'+ ++n;return {ok:true,message:'saved',items:[{id,filePath:id+'.png',fileUrl:'fixture://'+id,date:'today',createdAt:'today',groupId:'g',params:DEFAULT_PARAMS,actualSeed:1,model:'fixture',width:1,height:1}]};
 });
 const cancelNative=vi.fn(async(_id:string)=>{}),waitNative=vi.fn(async(_id:string)=>{});
 const queue=createComicGenerationQueue({store,storage,hasToken:async()=>true,quote:async()=>4,generate,cancel:cancelNative,afterSaved:hooks.afterSaved});
 const ask=vi.fn(async(args:Record<string,unknown>):Promise<Record<string,unknown>>=>{
  const current=store.read();
  switch(args.action){
   case '_comic.snapshot':if(args.expectedRevision!==current.revision)throw Error('revision changed');return {project:current.project};
   case '_comic.generation.preview':return queue.preview(args.tasks as ComicQueueTask[],String(args.expectedRevision));
   case '_comic.generation.launch':return queue.launch(args.tasks as ComicQueueTask[],{runId:String(args.runId),expectedRevision:String(args.expectedRevision),confirm:async()=>true});
   case '_comic.generation.status':return {...queue.getSnapshot(),active:queue.active};
   case '_comic.generation.stop':return queue.stop(String(args.runId));
   default:throw Error('unexpected '+args.action);
  }
 });
 const adapter={ask,wait:vi.fn(async(id:string)=>({...await queue.wait(id)})),source:()=>source,cancelNative,waitNative};
 const host=createAgentComicRun(root,adapter,sessions,approve,handoffMs);await host.initialize;
 cleanup.push(()=>host.close());
 const request=():AgentToolBridgeRequest=>({tool:'langbai_software_action',sessionId:'s1',callId:'call1',args:{action:'comic.generation.start',mode:'initial',panelIds:[],expectedRevision:store.read().revision}});
 const policy=(mode:'auto'|'confirm',limit=0)=>sessions.execute({tool:'studio_generation_policy',sessionId:'s1',args:{mode,limit}});
 const status=()=>host.execute({tool:'langbai_software_action',sessionId:'s1',args:{action:'comic.generation.status'}});
 async function start(){const req=request(),result=await host.execute(req);expect(result.ok,result.output).toBe(true);host.afterResponse(req,result,true);await host.settled();return result;}
 return {root,host,adapter,request,start,status,policy,sessions,globalStop,approve,store,queue,generate,hooks,cancelNative,waitNative,source:(s:string)=>{source=s;}};
}
it('default automatic mode durably queues then runs the real shared queue without a desktop or Agent approval',async()=>{
 const f=await fixture(),req=f.request(),result=await f.host.execute(req);expect(result.ok,result.output).toBe(true);expect(f.generate).not.toHaveBeenCalled();
 expect(JSON.parse(await fs.readFile(path.join(f.root,'comic-run.json'),'utf8'))).toMatchObject({phase:'queued',total:2,submitted:0});
 f.host.afterResponse(req,result,true);f.host.afterResponse(req,result,true);await f.host.settled();
 expect(f.generate).toHaveBeenCalledTimes(2);expect(f.approve).not.toHaveBeenCalled();expect(f.store.read().project.panels.map(p=>p.candidates.length)).toEqual([1,1]);
 expect((await f.status()).data).toMatchObject({phase:'completed',operation:{phase:'completed',submitted:2,done:2}});expect(f.host.busy).toBe(false);
});
it('one Agent approval covers a twelve-image plan rather than a repeated per-image prompt',async()=>{
 const f=await fixture(6);await f.policy('confirm');await f.start();expect(f.approve).toHaveBeenCalledOnce();expect(f.approve.mock.calls[0][0].args).toMatchObject({plannedImages:12,estimatedAnlas:4});expect(f.generate).toHaveBeenCalledTimes(12);
});
it('approval UI reports the actual comic count and is cancelled by the generation stop path',async()=>{
 const approvals=createImageApprovals(),request:AgentToolBridgeRequest={tool:'langbai_software_action',sessionId:'s1',args:{action:'comic.generation.start',plannedImages:12}};
 const waiting=approvals.wait(request);expect(approvals.execute({tool:'studio_image_approval',sessionId:'s1',args:{}}).data).toMatchObject({count:12,kind:'image'});approvals.cancelGeneration('s1');expect(await waiting).toBe(false);
});
it('denial releases the session without launching or charging',async()=>{const f=await fixture();await f.policy('confirm');f.approve.mockResolvedValue(false);expect((await f.host.execute(f.request())).ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();expect(f.host.busy).toBe(false);const signal=f.sessions.begin('s1');f.sessions.end('s1',signal);});
it.each(['project','source'])('a %s change during approval invalidates the entire plan',async kind=>{const f=await fixture();await f.policy('confirm');f.approve.mockImplementation(async()=>{if(kind==='project')f.store.update(p=>({...p,title:'changed'}));else f.source('changed');return true;});expect((await f.host.execute(f.request())).ok).toBe(false);expect(f.generate).not.toHaveBeenCalled();});
it('finite automatic quota rejects an oversized plan before spending any image',async()=>{const f=await fixture();await f.policy('auto',1);expect((await f.host.execute(f.request())).ok).toBe(false);expect((await f.sessions.read('s1')).remaining).toBe(1);expect(f.generate).not.toHaveBeenCalled();});
it('per-attempt quota is consumed even when a submitted request fails, without silent retry',async()=>{const f=await fixture();await f.policy('auto',2);f.hooks.network.mockRejectedValueOnce(Error('network failed'));await f.start();expect(f.hooks.network).toHaveBeenCalledOnce();expect((await f.sessions.read('s1')).remaining).toBe(1);expect((await f.status()).data).toMatchObject({phase:'failed',operation:{submitted:1}});});
it('revoking automatic policy after one output prevents submission of the next image',async()=>{const f=await fixture();f.hooks.afterSaved.mockImplementationOnce(async()=>{await f.policy('confirm');});await f.start();expect(f.hooks.network).toHaveBeenCalledOnce();expect((await f.status()).data).toMatchObject({phase:'failed',operation:{submitted:1}});});
it('changing source after a saved image prevents any request to the replacement provider',async()=>{const f=await fixture();f.hooks.afterSaved.mockImplementationOnce(async()=>f.source('changed'));await f.start();expect(f.hooks.network).toHaveBeenCalledOnce();expect(f.store.read().project.panels[0].candidates).toHaveLength(1);});
it('source drift during async preparation is rechecked immediately before network submission',async()=>{const f=await fixture();f.hooks.beforeGuard.mockImplementationOnce(async()=>f.source('changed'));await f.start();expect(f.hooks.network).not.toHaveBeenCalled();expect((await f.status()).data).toMatchObject({phase:'failed'});});
it('undelivered handoff and stale tool replies cannot start a queued plan',async()=>{const f=await fixture(),req=f.request(),r=await f.host.execute(req);f.host.afterResponse({...req,tool:'other'},r,true);expect(f.generate).not.toHaveBeenCalled();f.host.afterResponse(req,r,false);await f.host.settled();expect(f.generate).not.toHaveBeenCalled();expect((await f.status()).data).toMatchObject({operation:{phase:'interrupted'}});});
it('missing handoff times out without generating and releases the session',async()=>{const f=await fixture(1,20);expect((await f.host.execute(f.request())).ok).toBe(true);await f.host.settled();expect(f.generate).not.toHaveBeenCalled();expect(f.host.busy).toBe(false);});
it('a different session cannot stop the owned queued run but its owner can',async()=>{const f=await fixture(),r=await f.host.execute(f.request()),id=(r.data as any).id;expect((await f.host.execute({tool:'langbai_software_action',sessionId:'s2',args:{action:'comic.generation.stop',runId:id}})).ok).toBe(false);expect(f.cancelNative).not.toHaveBeenCalled();expect((await f.host.execute({tool:'langbai_software_action',sessionId:'s1',args:{action:'comic.generation.stop',runId:id}})).ok).toBe(true);await f.host.settled();expect(f.generate).not.toHaveBeenCalled();});
it('sidebar stop cancels only the owned native run, retaining a late first image and stopping the second',async()=>{
 const f=await fixture(),gate=deferred<void>();f.hooks.network.mockImplementationOnce(()=>gate.promise);const req=f.request(),r=await f.host.execute(req);f.host.afterResponse(req,r,true);await vi.waitFor(()=>expect(f.hooks.network).toHaveBeenCalledOnce());
 await f.sessions.execute({tool:'studio_stop_generation',sessionId:'s2',args:{}});expect(f.cancelNative).not.toHaveBeenCalled();
 await f.sessions.execute({tool:'studio_stop_generation',sessionId:'s1',args:{}});expect(f.globalStop).not.toHaveBeenCalled();expect(f.cancelNative).toHaveBeenCalledWith((r.data as any).id);gate.resolve();await f.host.settled();
 expect(f.generate).toHaveBeenCalledOnce();expect(f.store.read().project.panels[0].candidates).toHaveLength(1);expect((await f.status()).data).toMatchObject({phase:'cancelled',operation:{phase:'cancelled'}});
});
it('renderer termination cancels the exact native run and waits for it before releasing the lease',async()=>{
 const f=await fixture(),gate=deferred<void>();f.adapter.wait.mockRejectedValue(Error('renderer destroyed'));f.waitNative.mockImplementation(()=>gate.promise);
 const req=f.request(),r=await f.host.execute(req);f.host.afterResponse(req,r,true);await vi.waitFor(()=>expect(f.waitNative).toHaveBeenCalled());expect(f.host.busy).toBe(true);expect(f.cancelNative).toHaveBeenCalledWith((r.data as any).id);gate.resolve();await f.host.settled();expect(f.host.busy).toBe(false);expect((await f.status()).data).toMatchObject({operation:{phase:'failed'}});
});
it('request tampering never reaches the paid backend',async()=>{const f=await fixture();f.hooks.request.mockImplementationOnce(r=>({...r,panelPrompt:'changed'}));await f.start();expect(f.hooks.network).not.toHaveBeenCalled();expect((await f.status()).data).toMatchObject({operation:{phase:'failed',submitted:0}});});
it('crashed operation journal reopens as interrupted without replay, malformed records are preserved',async()=>{
 const f=await fixture(),r=await f.host.execute(f.request()),file=path.join(f.root,'comic-run.json'),saved=await fs.readFile(file,'utf8');await f.host.close();await fs.writeFile(file,saved);
 const reopened=createAgentComicRun(f.root,f.adapter,f.sessions,f.approve);await reopened.initialize;expect((await reopened.execute({tool:'langbai_software_action',sessionId:'s1',args:{action:'comic.generation.status'}})).data).toMatchObject({operation:{id:(r.data as any).id,phase:'interrupted'}});expect(f.generate).not.toHaveBeenCalled();await reopened.close();
 await fs.writeFile(file,'{"phase":"running"}');const corrupt=createAgentComicRun(f.root,f.adapter,f.sessions,f.approve);await expect(corrupt.initialize).rejects.toThrow('损坏');expect((await corrupt.execute(f.request())).ok).toBe(false);expect(await fs.readFile(file,'utf8')).toBe('{"phase":"running"}');
});
it('reserved Agent run permissions cannot be fabricated, reused after disposal or double registered',async()=>{const req={runId:'agent-comic-test'} as TagComicGenerateRequest;await expect(authorizeAgentComicRequest(req)).rejects.toThrow();const check=vi.fn(async()=>{}),dispose=registerAgentComicRun(req.runId!,check);expect(()=>registerAgentComicRun(req.runId!,check)).toThrow();await authorizeAgentComicRequest(req);expect(check).toHaveBeenCalledOnce();dispose();await expect(authorizeAgentComicRequest(req)).rejects.toThrow();await expect(authorizeAgentComicRequest({runId:'ordinary-ui-uuid'} as TagComicGenerateRequest)).resolves.toBeUndefined();});
it('credential/config binding changes with endpoint or key, and never enables a hidden provider fallback',()=>{const settings={imageProvider:'novelai',apiBaseUrl:'https://native.invalid',imageBaseUrl:'https://images.invalid'} as AppSettings;const a=comicSourceBinding(settings,'test-token');expect(a).not.toContain('test-token');expect(comicSourceBinding(settings,'changed')).not.toBe(a);expect(comicSourceBinding({...settings,imageBaseUrl:'https://changed.invalid'},'test-token')).not.toBe(a);expect(()=>comicSourceBinding({...settings,imageProvider:'openai-images'},'test-token')).toThrow('未自动切换');expect(()=>comicSourceBinding(settings,'')).toThrow('Token');});
