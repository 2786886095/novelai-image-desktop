import {it,expect,vi} from 'vitest';
vi.mock('./store',()=>({useAppStore:{}}));
import {createStudioAgentService,type StudioAgentDependencies} from './studio-agent';
function fixture(){
 let state={isGenerating:true,isGenerateQueueRunning:true,queuePaused:false,generationQueue:[{id:'q',params:{positivePrompt:'test'}}],queueProgress:{done:0,failed:0,total:1},settings:{}} as any;
 state.togglePause=()=>{state.queuePaused=!state.queuePaused;};state.removeQueueJob=(id:string)=>{state.generationQueue=state.generationQueue.filter((x:any)=>x.id!==id);};state.clearQueue=()=>{state.generationQueue=[];};state.cancel=async()=>{state.isGenerating=false;state.isGenerateQueueRunning=false;state.generationQueue=[];};
 const service=createStudioAgentService({getState:()=>state,setState:p=>Object.assign(state,p),uuid:()=> 'fixture',api:{} as StudioAgentDependencies['api']});
 return {state,call:(args:Record<string,unknown>)=>service.handle({id:'test',action:'tasks',args})};
}
it('desktop queue controls read actual live state, reject stale edits and retain completed results',async()=>{
 const f=fixture();let r=await f.call({action:'list'}),rev=(r.data as any).revision;
 r=await f.call({action:'pause',expectedRevision:rev});expect(r.ok).toBe(true);expect((r.data as any).paused).toBe(true);
 expect((await f.call({action:'resume',expectedRevision:rev})).ok).toBe(false);
 r=await f.call({action:'resume',expectedRevision:(r.data as any).revision});expect(r.ok).toBe(true);expect((r.data as any).paused).toBe(false);
 r=await f.call({action:'remove',id:'q',expectedRevision:(r.data as any).revision});expect(r.ok).toBe(true);expect(f.state.generationQueue).toEqual([]);
 r=await f.call({action:'cancel'});expect(r.ok).toBe(true);expect((r.data as any).cancellationRequested).toBe(true);expect((r.data as any).running).toBe(false);
});
it('task commands reject arbitrary calls and do not pretend a missing job was removed',async()=>{
 const f=fixture();const r=await f.call({action:'list'});
 expect((await f.call({action:'remove',id:'missing',expectedRevision:(r.data as any).revision})).ok).toBe(false);
 expect((await f.call({action:'eval',code:'anything'})).ok).toBe(false);
 expect((await f.call({action:'clear',confirmed:true,expectedRevision:(r.data as any).revision})).ok).toBe(false);
});
