import {describe,expect,it,vi} from 'vitest';
import type {ComfySlotValue} from './contract';
import {COMFY_WORKSPACE_DRAFTS_KEY,COMFY_WORKSPACE_DRAFT_LIMIT,loadComfyWorkspaceDrafts,saveComfyWorkspaceDrafts,type ComfyWorkspaceDraft,type ComfyWorkspaceDrafts} from './workspace-drafts';

const SHA='Ab'.repeat(32);
const draft=(extra:Partial<ComfyWorkspaceDraft>={}):ComfyWorkspaceDraft=>({workflowId:'workflow-1',sourceSha256:SHA,values:{'positive:6:text':'a cup','width:4:width':832,'parameter:9:enabled':false,'parameter:9:typed':'0'},seedMode:'random',...extra});
const state=(items:ComfyWorkspaceDraft[]=[draft()]):ComfyWorkspaceDrafts=>({selectedId:items[0]?.workflowId??'',drafts:items});
function store(raw:string|null=null){
  let current=raw;
  return {getItem:vi.fn((_key:string)=>current),setItem:vi.fn((_key:string,value:string)=>{current=value;}),raw:()=>current};
}
const encoded=(drafts:unknown[],selectedId:unknown='workflow-1',version:unknown=1)=>JSON.stringify({version,selectedId,drafts});
function rejected(snapshot:ComfyWorkspaceDrafts){
  const storage=store('pristine');expect(()=>saveComfyWorkspaceDrafts(snapshot,storage)).toThrow();expect(storage.setItem).not.toHaveBeenCalled();expect(storage.raw()).toBe('pristine');
}

describe('Comfy workspace draft persistence',()=>{
  it('loads an absent record without warning or writing to storage',()=>{
    const storage=store();expect(loadComfyWorkspaceDrafts(storage)).toEqual({selectedId:'',drafts:[],warning:false});expect(storage.setItem).not.toHaveBeenCalled();expect(storage.getItem).toHaveBeenCalledWith(COMFY_WORKSPACE_DRAFTS_KEY);
  });
  it('round-trips selection, every scalar type, unknown legal slots, insertion order and seed modes',()=>{
    const values={'unknown:10:custom':'',typedFalse:false,typedZero:0,typedTextZero:'0',typedTrue:true,typedTextTrue:'true',fraction:-0.25};
    const original=state([draft({values}),draft({workflowId:'workflow-2',sourceSha256:'f'.repeat(64),values:{fixed:12345},seedMode:'fixed'})]),storage=store();
    const before=JSON.stringify(original);saveComfyWorkspaceDrafts(original,storage);
    const loaded=loadComfyWorkspaceDrafts(storage);expect(loaded.warning).toBe(false);expect(loaded.selectedId).toBe(original.selectedId);expect(loaded.drafts).toEqual(original.drafts);expect(Object.keys(loaded.drafts[0].values)).toEqual(Object.keys(values));expect(JSON.stringify(original)).toBe(before);expect(storage.setItem).toHaveBeenCalledWith(COMFY_WORKSPACE_DRAFTS_KEY,expect.any(String));expect(JSON.parse(storage.raw()!).version).toBe(1);
  });
  it('preserves source hash bytes and does not rebind a saved draft to a changed source',()=>{
    const storage=store();saveComfyWorkspaceDrafts(state(),storage);const saved=loadComfyWorkspaceDrafts(storage).drafts[0];expect(saved.sourceSha256).toBe(SHA);expect(saved.sourceSha256).not.toBe(SHA.toLowerCase());expect(saved.workflowId==='workflow-1'&&saved.sourceSha256==='c'.repeat(64)).toBe(false);
  });
  it('allows empty selection without dropping records',()=>{const storage=store();saveComfyWorkspaceDrafts({...state(),selectedId:''},storage);expect(loadComfyWorkspaceDrafts(storage)).toEqual({...state(),selectedId:'',warning:false});});
  it('accepts null-prototype slot maps and reconstructs them without a prototype',()=>{
    const values:Record<string,ComfySlotValue>=Object.create(null);values['parameter:1:custom']=false;
    const storage=store();saveComfyWorkspaceDrafts(state([draft({values})]),storage);expect(Object.getPrototypeOf(loadComfyWorkspaceDrafts(storage).drafts[0].values)).toBe(null);
  });
  it('throws quota failures without changing the previously durable snapshot',()=>{
    const failure=new Error('QuotaExceededError'),storage=store('pristine');storage.setItem.mockImplementation(()=>{throw failure;});expect(()=>saveComfyWorkspaceDrafts(state(),storage)).toThrow(failure);expect(storage.raw()).toBe('pristine');
  });
  it('reports an unavailable reader without throwing or writing',()=>{expect(loadComfyWorkspaceDrafts({getItem:()=>{throw new Error('SecurityError');}})).toEqual({selectedId:'',drafts:[],warning:true});});
  it.each(['{bad JSON',encoded([], '',2),'null','[]',JSON.stringify({version:1,selectedId:'',drafts:{}})])('warns on invalid envelope %s',raw=>{
    const storage=store(raw);expect(loadComfyWorkspaceDrafts(storage)).toEqual({selectedId:'',drafts:[],warning:true});expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('filters invalid records and duplicate workflow ids with visible warning and no automatic repair write',()=>{
    const storage=store(encoded([draft(),{...draft(),workflowId:'bad/id'},draft({workflowId:'workflow-2'}),draft({sourceSha256:'0'.repeat(64)})]));
    const loaded=loadComfyWorkspaceDrafts(storage);expect(loaded.warning).toBe(true);expect(loaded.drafts.map(x=>x.workflowId)).toEqual(['workflow-1','workflow-2']);expect(loaded.drafts[0].sourceSha256).toBe(SHA);expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('clears invalid selected id but preserves otherwise valid records with warning',()=>{
    const loaded=loadComfyWorkspaceDrafts(store(encoded([draft()],'../bad')));expect(loaded.selectedId).toBe('');expect(loaded.drafts).toEqual([draft()]);expect(loaded.warning).toBe(true);
  });
  it.each(['__proto__','constructor','prototype'])('rejects dangerous slot key %s on save and filters the affected draft on load',key=>{
    const values:Record<string,ComfySlotValue>=Object.create(null);values[key]='malicious';rejected(state([draft({values})]));
    const loaded=loadComfyWorkspaceDrafts(store(encoded([draft({values}),draft({workflowId:'good'})])));expect(loaded.warning).toBe(true);expect(loaded.drafts.map(x=>x.workflowId)).toEqual(['good']);expect(({} as {malicious?:unknown}).malicious).toBeUndefined();
  });
  it('rejects inherited slot state instead of serializing a partial snapshot',()=>{const values=Object.create({lost:'inherited'}) as Record<string,ComfySlotValue>;values.own='own';rejected(state([draft({values})]));});
  it('rejects getter, non-enumerable and symbol slot values without executing the getter',()=>{
    const getter=vi.fn(()=>123),getters={};Object.defineProperty(getters,'x',{enumerable:true,get:getter});rejected(state([draft({values:getters})]));expect(getter).not.toHaveBeenCalled();
    const hidden={};Object.defineProperty(hidden,'x',{value:123});rejected(state([draft({values:hidden})]));
    const symbols={x:1,[Symbol('hidden')]:2};rejected(state([draft({values:symbols})]));
  });
  it.each([NaN,Infinity,-Infinity,null,{},[],undefined])('rejects non-JSON scalar or nonfinite value %s',value=>rejected(state([draft({values:{x:value as ComfySlotValue}})])));
  it.each(['','a'.repeat(257),'x\ninput'])('rejects invalid slot id %s',key=>rejected(state([draft({values:{[key]:1}})])));
  it.each(['bad/id','x'.repeat(129),'__proto__','constructor','prototype'])('rejects invalid workflow id %s',workflowId=>rejected(state([draft({workflowId})])));
  it.each(['f'.repeat(63),'g'.repeat(64),'f'.repeat(65),''])('rejects invalid source SHA %s',sourceSha256=>rejected(state([draft({sourceSha256})])));
  it('rejects invalid seed mode',()=>rejected(state([draft({seedMode:'auto' as 'random'})])));
  it('rejects duplicate workflow records rather than silently overwriting either',()=>rejected(state([draft(),draft({sourceSha256:'f'.repeat(64)})])));
  it('allows exact scalar and slot-count boundaries',()=>{
    const values=Object.fromEntries(Array.from({length:128},(_,i)=>[`slot:${i}`,i===0?'x'.repeat(65_536):i]));
    const storage=store();saveComfyWorkspaceDrafts(state([draft({values})]),storage);expect(loadComfyWorkspaceDrafts(storage).drafts[0].values).toEqual(values);
  });
  it('rejects one oversized scalar or too many slots instead of truncating',()=>{
    rejected(state([draft({values:{x:'x'.repeat(65_537)}})]));rejected(state([draft({values:Object.fromEntries(Array.from({length:129},(_,i)=>[`slot:${i}`,i]))})]));
  });
  it('rejects over-limit record counts on save and load rather than dropping the tail',()=>{
    const drafts=Array.from({length:COMFY_WORKSPACE_DRAFT_LIMIT+1},(_,i)=>draft({workflowId:`workflow-${i}`}));rejected(state(drafts));expect(loadComfyWorkspaceDrafts(store(encoded(drafts)))).toEqual({selectedId:'',drafts:[],warning:true});
  });
  it('accepts 100 records without reordering them',()=>{
    const drafts=Array.from({length:COMFY_WORKSPACE_DRAFT_LIMIT},(_,i)=>draft({workflowId:`workflow-${100-i}`})),storage=store();saveComfyWorkspaceDrafts(state(drafts),storage);expect(loadComfyWorkspaceDrafts(storage).drafts.map(x=>x.workflowId)).toEqual(drafts.map(x=>x.workflowId));
  });
  it('enforces the total UTF-8 byte bound even when JS character count is below 1 MiB',()=>{
    const values=Object.fromEntries(Array.from({length:6},(_,i)=>[`text:${i}`,'界'.repeat(65_536)])),snapshot=state([draft({values})]);
    expect(JSON.stringify(snapshot).length).toBeLessThan(1024*1024);rejected(snapshot);const storage=store(encoded(snapshot.drafts));expect(loadComfyWorkspaceDrafts(storage)).toEqual({selectedId:'',drafts:[],warning:true});expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('rejects an oversized ASCII snapshot without a partial setItem',()=>rejected(state([draft({values:Object.fromEntries(Array.from({length:17},(_,i)=>[`text:${i}`,'x'.repeat(65_536)]))})])));
});
