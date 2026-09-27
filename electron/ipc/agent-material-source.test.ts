import {it,expect,vi} from 'vitest';
import {createLibraryTools} from './agent-library-tools';
it('private local transfer preserves over 50 entries without credential/path/avatar fields',async()=>{
 const item={id:'book',name:'Rain',avatarPath:'private',apiKey:'secret',entries:Array.from({length:70},(_,i)=>({id:String(i),keys:['rain'],content:'world',position:'before-character',insertionOrder:42,apiKey:'nested-secret'}))};
 const tools=createLibraryTools({read:async()=>({rows:[item]}),write:vi.fn(),backup:vi.fn()},vi.fn());
 const r=await tools.execute({tool:'studio_material_source',args:{collection:'lorebooks',id:'book'},sessionId:'one'});
 expect(r.ok,r.output).toBe(true);expect((r.data as any).item.entries).toHaveLength(70);expect(JSON.stringify(r)).not.toMatch(/secret|avatarPath/);
});
it('invalid source types and injected confirmation flags are rejected before any disclosure or authorization',async()=>{
 const approve=vi.fn(),tools=createLibraryTools({read:async()=>({rows:[{id:'c',name:'c',description:{apiKey:'secret'}}]}),write:vi.fn(),backup:vi.fn()},approve);
 const r=await tools.execute({tool:'studio_material_source',args:{collection:'characters',id:'c'}});expect(r.ok).toBe(false);expect(JSON.stringify(r)).not.toContain('secret');
 const c=await tools.execute({tool:'studio_material_confirm',args:{collection:'characters',name:'C',revision:'x',approved:true}});expect(c.ok).toBe(false);expect(approve).not.toHaveBeenCalled();
});
it('confirmation returns only user decision, without writing library or refreshing software',async()=>{
 const write=vi.fn(),approve=vi.fn(async()=>false),tools=createLibraryTools({read:vi.fn(),write,backup:vi.fn()},approve);
 const request={tool:'studio_material_confirm',args:{name:'Rain',collection:'characters',revision:'rev'},sessionId:'current'};
 const r=await tools.execute(request);expect(r.data).toEqual({approved:false});expect(approve).toHaveBeenCalledWith(request);expect(write).not.toHaveBeenCalled();
});
