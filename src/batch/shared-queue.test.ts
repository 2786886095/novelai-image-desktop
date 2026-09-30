import {it,expect,vi} from 'vitest';
import {createBatchGenerationQueue,selectBatchTasks,prepareBatchTasks,BATCH_RUN_KEY} from './generation-queue';
import {createBatchProjectStore} from './project-store';
import {createBatchProjectActions} from '../agent/batch-project-actions';
import {createDefaultBatchRedraw,DEFAULT_PARAMS,type BatchRedrawRequest,type BatchRedrawItem,type GenerateResult} from '../types';
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
const output=(id='out')=>({id,filePath:id+'.png',fileUrl:'fixture://'+id,date:'today',createdAt:'today',groupId:'g',params:DEFAULT_PARAMS,actualSeed:1,model:'fixture',width:64,height:64});
function fixture(count=2){
 let project={...createDefaultBatchRedraw(DEFAULT_PARAMS),groupName:'fixture',candidateCount:count,items:[{id:'a',name:'source-a',base64:'eA==',width:64,height:64,prompt:'forest',strength:null,overrideParams:false,params:{},status:'pending',candidates:[]},{id:'b',name:'source-b',base64:'eA==',width:64,height:64,prompt:'ocean',strength:null,overrideParams:false,params:{},status:'pending',candidates:[]}] as BatchRedrawItem[]},busy=false;
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 const store=createBatchProjectStore({get:()=>({project,busy}),update:p=>{project=p;},busy:b=>{busy=b;}});
 let n=0;const generate=vi.fn(async(_request:BatchRedrawRequest):Promise<GenerateResult>=>({ok:true,message:'saved',items:[output('out-'+ ++n)]}));
 const prepare=vi.fn(async()=>({binding:'fixture-binding',provider:'novelai' as const})),cancel=vi.fn(async()=>{}),afterSaved=vi.fn(async()=>{});
 const deps={store,storage,prepare,generate,cancel,afterSaved},queue=createBatchGenerationQueue(deps);
 const start=(ids:string[]=[])=>{const s=store.read();return queue.launch(selectBatchTasks(s.project,'all',ids),{expectedRevision:s.revision});};
 return {store,storage,values,queue,start,generate,prepare,cancel,afterSaved,deps};
}
it('application-owned queue generates all candidates and locks a complete request snapshot',async()=>{
 const f=fixture();const gate=deferred<GenerateResult>();f.generate.mockImplementationOnce(()=>gate.promise);const run=f.start();
 await vi.waitFor(()=>expect(f.generate).toHaveBeenCalledOnce());expect(f.store.read().busy).toBe(true);expect(()=>f.start()).toThrow();
 f.store.update(p=>({...p,globalStyle:'changed next run',items:p.items.map(x=>({...x,prompt:'changed next run'}))}));gate.resolve({ok:true,message:'saved',items:[output('first')]});
 expect((await f.queue.wait(run.id)).phase).toBe('completed');expect(f.generate).toHaveBeenCalledTimes(4);
 expect(f.generate.mock.calls[2][0].params.positivePrompt).toBe('ocean');expect(f.store.read().project.items.map(i=>i.candidates.length)).toEqual([2,2]);expect(f.store.read().busy).toBe(false);
});
it('late cancelled response retains every durable output and stops later candidates',async()=>{
 const f=fixture(),gate=deferred<GenerateResult>();f.generate.mockImplementationOnce(()=>gate.promise);const run=f.start();await vi.waitFor(()=>expect(f.generate).toHaveBeenCalledOnce());await f.queue.stop(run.id);
 gate.resolve({ok:false,failureKind:'cancelled',message:'stopped',items:[output('a'),output('b')]});const state=await f.queue.wait(run.id);
 expect(state).toMatchObject({phase:'cancelled',done:1,images:2});expect(f.store.read().project.items[0].candidates).toHaveLength(2);expect(f.generate).toHaveBeenCalledOnce();expect(f.cancel).toHaveBeenCalledWith(run.id);
});
it('partial failure preserves images and halts without retry or next item',async()=>{
 const f=fixture();f.generate.mockResolvedValueOnce({ok:false,message:'partial',items:[output()]});const run=f.start();expect(await f.queue.wait(run.id)).toMatchObject({phase:'failed',done:1,images:1,error:'partial'});expect(f.generate).toHaveBeenCalledOnce();expect(f.store.read().project.items[0]).toMatchObject({status:'failed',selectedCandidateId:'out'});
});
it('keeps previous manual selection when more candidates arrive',async()=>{
 const f=fixture(1);f.store.update(p=>({...p,items:p.items.map(i=>({...i,candidates:[{id:'manual',historyItemId:'manual',resultPath:'manual.png',resultUrl:'fixture://manual'}],selectedCandidateId:'manual'}))}));const run=f.start();await f.queue.wait(run.id);expect(f.store.read().project.items.every(i=>i.selectedCandidateId==='manual'&&i.candidates.length===2)).toBe(true);
});
it('stop during preflight never cancels another native request or launches a late one',async()=>{
 const f=fixture(),gate=deferred<{binding:string;provider:'novelai'}>();f.prepare.mockImplementationOnce(()=>gate.promise);const run=f.start();await f.queue.stop(run.id);expect((await f.queue.wait(run.id)).phase).toBe('cancelled');gate.resolve({binding:'later',provider:'novelai'});await Promise.resolve();expect(f.generate).not.toHaveBeenCalled();expect(f.cancel).not.toHaveBeenCalled();
});
it('failed preflight clears busy without sending images',async()=>{const f=fixture();f.prepare.mockRejectedValueOnce(Error('provider changed'));const run=f.start();expect((await f.queue.wait(run.id)).phase).toBe('failed');expect(f.generate).not.toHaveBeenCalled();expect(f.store.read().busy).toBe(false);});
it('changed project while awaiting preflight requires a fresh start',async()=>{const f=fixture(),gate=deferred<{binding:string;provider:'novelai'}>();f.prepare.mockImplementationOnce(()=>gate.promise);const run=f.start();f.store.update(p=>({...p,groupName:'new'}));gate.resolve({binding:'fixture',provider:'novelai'});expect((await f.queue.wait(run.id)).phase).toBe('failed');expect(f.generate).not.toHaveBeenCalled();});
it('readback state survives queue recreation without replaying an interrupted run',()=>{const f=fixture();f.values.set(BATCH_RUN_KEY,JSON.stringify({id:'old',phase:'running',total:4,done:1,images:1,inFlightItemId:'a',error:null}));const queue=createBatchGenerationQueue(f.deps);expect(queue.getSnapshot()).toMatchObject({id:'old',phase:'interrupted',done:1});expect(f.generate).not.toHaveBeenCalled();});
it('malformed durable receipt is not overwritten or silently reset',()=>{const f=fixture();f.values.set(BATCH_RUN_KEY,'broken');const q=createBatchGenerationQueue(f.deps);expect(()=>q.launch([{itemId:'a',ordinal:0}],{expectedRevision:f.store.read().revision})).toThrow();expect(f.values.get(BATCH_RUN_KEY)).toBe('broken');});
it('receipt storage failure prevents launch',()=>{const f=fixture();f.storage.setItem=()=>{throw Error('disk full');};expect(()=>f.start()).toThrow('disk full');expect(f.generate).not.toHaveBeenCalled();expect(f.store.read().busy).toBe(false);});
it('invalid sizes, duplicate tasks and missing prompts fail before submission',()=>{const f=fixture();expect(()=>prepareBatchTasks(f.store.read().project,[{itemId:'a',ordinal:0},{itemId:'a',ordinal:0}])).toThrow();f.store.update(p=>({...p,sizeMode:'perImage',sizeBulk:'not a size'}));expect(()=>f.start()).toThrow();f.store.update(p=>({...p,items:p.items.map(i=>({...i,prompt:''}))}));expect(()=>selectBatchTasks(f.store.read().project,'all',[])).toThrow();expect(f.generate).not.toHaveBeenCalled();});
it('Agent changes real project, requires fresh revision and never accepts output paths',()=>{const f=fixture(),actions=createBatchProjectActions(f.store);const read=actions.execute({action:'batch.project.read'});expect(JSON.stringify(read)).not.toContain('eA==');const revision=f.store.read().revision;actions.execute({action:'batch.items.update',id:'a',expectedRevision:revision,patch:{prompt:'new forest',strength:0.3}});expect(f.store.read().project.items[0]).toMatchObject({prompt:'new forest',strength:0.3});expect(()=>actions.execute({action:'batch.project.update',expectedRevision:revision,patch:{candidateCount:3}})).toThrow();expect(()=>actions.execute({action:'batch.items.update',id:'a',expectedRevision:f.store.read().revision,patch:{resultPath:'C:/other.png'}})).toThrow();});
it('Agent cannot mutate running project or select a nonexistent candidate',async()=>{const f=fixture(),actions=createBatchProjectActions(f.store);expect(()=>actions.execute({action:'batch.candidates.select',id:'a',candidateId:'missing',expectedRevision:f.store.read().revision})).toThrow();const gate=deferred<GenerateResult>();f.generate.mockImplementationOnce(()=>gate.promise);const run=f.start();await vi.waitFor(()=>expect(f.generate).toHaveBeenCalledOnce());expect(()=>actions.execute({action:'batch.items.update',id:'a',patch:{prompt:'changed'},expectedRevision:f.store.read().revision})).toThrow();await f.queue.stop();gate.resolve({ok:false,message:'cancelled',items:[]});await f.queue.wait(run.id);});
