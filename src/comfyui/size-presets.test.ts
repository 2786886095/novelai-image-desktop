import {describe,expect,it,vi} from 'vitest';
import type {ComfySlot} from './contract';
import {COMFY_BUILTIN_SIZES,COMFY_CUSTOM_SIZE_LIMIT,COMFY_SIZE_PRESETS_KEY,comfyDimensionPixels,comfyDimensionPresetValue,comfySizeId,comfySizePresetValues,loadComfySizePresets,parseComfySizePresets,saveComfySizePresets} from './size-presets';
const size={width:768,height:1152};
const raw=(items:unknown[])=>JSON.stringify({version:1,items});
const slot=(kind:'width'|'height',extra:Partial<ComfySlot>={}):ComfySlot=>({id:`${kind}:6:${kind}`,kind,nodeId:'6',input:kind,classType:'FixtureDimensions',label:kind,valueType:'int',defaultValue:1024,min:16,max:16384,step:64,...extra});
describe('ComfyUI globally shared size preset data',()=>{
  it('contains exactly the three requested built-in width/height pairs',()=>expect(COMFY_BUILTIN_SIZES.map(comfySizeId)).toEqual(['1024x1024','832x1216','1216x832']));
  it('treats missing storage data as a valid empty custom list',()=>expect(parseComfySizePresets(null)).toEqual({custom:[],warning:false}));
  it('keeps only canonical numeric fields and does not mutate the supplied data',()=>expect(parseComfySizePresets(raw([{...size,token:'not persisted'}]))).toEqual({custom:[size],warning:false}));
  it('deduplicates custom entries and never makes built-ins deletable custom records',()=>expect(parseComfySizePresets(raw([size,size,...COMFY_BUILTIN_SIZES]))).toEqual({custom:[size],warning:false}));
  it.each(['{','[]','null','{"version":2,"items":[]}','x'.repeat(16385)])('recovers visibly from invalid/unsupported data %s',value=>expect(parseComfySizePresets(value)).toEqual({custom:[],warning:true}));
  it('keeps valid entries while warning about malformed or unsafe dimensions',()=>expect(parseComfySizePresets(raw([size,{width:0,height:1},{width:1.5,height:2},{width:'832',height:1216},{width:Number.MAX_SAFE_INTEGER+1,height:1},null]))).toEqual({custom:[size],warning:true}));
  it('bounds custom entries without silently reporting a complete load',()=>{const result=parseComfySizePresets(raw(Array.from({length:40},(_,i)=>({width:100+i,height:200+i}))));expect(result.custom).toHaveLength(COMFY_CUSTOM_SIZE_LIMIT);expect(result.warning).toBe(true);});
  it('makes read failures visible and does not write while loading',()=>{const storage={getItem:vi.fn(()=>{throw new Error('blocked');}),setItem:vi.fn()};expect(loadComfySizePresets(storage)).toEqual({custom:[],warning:true});expect(storage.setItem).not.toHaveBeenCalled();});
  it('writes a versioned bounded record to the one global workbench key',()=>{const setItem=vi.fn();saveComfySizePresets([size],{setItem});expect(setItem).toHaveBeenCalledExactlyOnceWith(COMFY_SIZE_PRESETS_KEY,raw([size]));});
  it('does not swallow quota failures or claim that a preset was persisted',()=>expect(()=>saveComfySizePresets([size],{setItem:()=>{throw new Error('quota');}})).toThrow('quota'));
  it.each([[...COMFY_BUILTIN_SIZES],[size,size],[{width:-1,height:1}],Array.from({length:33},(_,i)=>({width:i+1,height:2}))].map(items=>[items] as const))('rejects invalid or unbounded writes before touching storage',items=>{const setItem=vi.fn();expect(()=>saveComfySizePresets(items,{setItem})).toThrow('COMFY_SIZE_PRESETS_INVALID');expect(setItem).not.toHaveBeenCalled();});
});
describe('ComfyUI exact typed dimension binding',()=>{
  it.each([0,-1,1.5,Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1])('rejects invalid pixel values %s',pixels=>expect(comfyDimensionPresetValue(slot('width'),pixels,1024)).toBeNull());
  it('uses real min/max, but does not mistake UI step for min+n*step validation',()=>{expect(comfyDimensionPresetValue(slot('width'),832,1024)).toBe(832);expect(comfyDimensionPresetValue(slot('width',{max:768}),832,512)).toBeNull();expect(comfyDimensionPresetValue(slot('width',{min:1024}),832,1024)).toBeNull();});
  it('retains literal local combo scalar types',()=>{expect(comfyDimensionPresetValue(slot('width',{valueType:'combo',options:['832','1024']}),832,'1024')).toBe('832');expect(comfyDimensionPresetValue(slot('width',{valueType:'combo',options:[832,1024]}),832,1024)).toBe(832);});
  it('does not guess between explicitly distinct numeric and string enum options',()=>{const width=slot('width',{valueType:'combo',options:[832,'832']});expect(comfyDimensionPresetValue(width,832,'832')).toBe('832');expect(comfyDimensionPresetValue(width,832,832)).toBe(832);expect(comfyDimensionPresetValue(width,832,null)).toBeNull();});
  it('rejects undeclared enum choices and unsupported widget types',()=>{expect(comfyDimensionPresetValue(slot('width',{valueType:'combo',options:[512]}),832,512)).toBeNull();expect(comfyDimensionPresetValue(slot('width',{valueType:'string'}),832,'832')).toBeNull();});
  it('only binds a complete width and height on the same node',()=>{const width=slot('width'),height=slot('height');expect(comfySizePresetValues({width:832,height:1216},width,height,1024,1024)).toEqual({width:832,height:1216});expect(comfySizePresetValues(size,width,{...height,nodeId:'7'},1024,1024)).toBeNull();expect(comfySizePresetValues(size,height,width,1024,1024)).toBeNull();});
  it('only interprets canonical positive integer display strings as dimensions',()=>{expect(comfyDimensionPixels('832')).toBe(832);for(const value of ['0832','1e3',' 832','832.0','',false,null,-1,0,1.5])expect(comfyDimensionPixels(value)).toBeNull();});
});
