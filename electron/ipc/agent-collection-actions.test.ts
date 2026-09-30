import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import sharp from 'sharp';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('electron',()=>({dialog:{},shell:{}}));
import {createCollectionActions} from './agent-collection-actions';
import {createImageFavorites} from './image-favorites';
import {startHarnessBridge} from './harness-bridge';
let root:string,source:string,bytes:Buffer,store:ReturnType<typeof createImageFavorites>;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-collection-'));source=path.join(root,'original.png');bytes=await sharp({create:{width:8,height:12,channels:4,background:'#345678'}}).withMetadata({exif:{IFD0:{ImageDescription:'metadata fixture'}}}).png().toBuffer();await fs.writeFile(source,bytes);store=createImageFavorites({indexPath:path.join(root,'index.json'),defaultDirectory:path.join(root,'favorites')});});
afterEach(()=>fs.rm(root,{recursive:true,force:true}));
function fixture(approve=vi.fn(async()=>true)){
 const actions=createCollectionActions({read:()=>store.list(),apply:(a)=>{
  if(a.action==='favorites.local.add')return store.add(source,String(a.expectedRevision));
  if(a.action==='favorites.local.rename')return store.rename(String(a.id),String(a.name),String(a.expectedRevision));
  return store.remove(String(a.id),String(a.expectedRevision));
 }},approve);
 return {actions,approve,call:(args:Record<string,unknown>,signal?:AbortSignal)=>actions.execute({tool:'langbai_software_action',args,sessionId:'s',signal})};
}
it('actual original-byte archive, suffix rename and retained files on approved removal',async()=>{
 const f=fixture(),initial=await f.call({action:'favorites.local.list'});const added=await f.call({action:'favorites.local.add',id:'history',expectedRevision:(initial.data as any).revision});expect(added.ok,added.output).toBe(true);
 const item=(added.data as any).readback[0];expect(await fs.readFile(item.filePath)).toEqual(bytes);expect(f.approve).not.toHaveBeenCalled();
 const renamed=await f.call({action:'favorites.local.rename',id:item.id,name:'黄昏',expectedRevision:(added.data as any).revision});expect(renamed.ok,renamed.output).toBe(true);const file=(renamed.data as any).readback[0].filePath;
 const removed=await f.call({action:'favorites.local.remove',id:item.id,expectedRevision:(renamed.data as any).revision});expect(removed.ok,removed.output).toBe(true);expect(f.approve).toHaveBeenCalledTimes(1);expect(await fs.readFile(file)).toEqual(bytes);expect(await fs.readFile(source)).toEqual(bytes);
});
it('denial, cancellation during approval and UI edits during approval do not remove records',async()=>{
 const item=await store.add(source);let rev=(await store.list()).revision;
 const denied=fixture(vi.fn(async()=>false));expect((await denied.call({action:'favorites.local.remove',id:item.item.id,expectedRevision:rev})).ok).toBe(false);
 const abort=new AbortController(),cancelled=fixture(vi.fn(async()=>{abort.abort();return true;}));expect((await cancelled.call({action:'favorites.local.remove',id:item.item.id,expectedRevision:rev},abort.signal)).ok).toBe(false);
 const changed=fixture(vi.fn(async()=>{await store.rename(item.item.id,'user-edit');return true;}));expect((await changed.call({action:'favorites.local.remove',id:item.item.id,expectedRevision:rev})).ok).toBe(false);expect((await store.list()).items[0].name).toBe('user-edit');
});
it('filesystem CAS is shared with UI operations and prevents lost updates',async()=>{
 const first=await store.add(source),state=await store.list();await store.rename(first.item.id,'UI');
 await expect(store.remove(first.item.id,state.revision)).rejects.toThrow('已变化');expect((await store.list()).items).toHaveLength(1);
});
it('cancelled directory selection is not reported as executed',async()=>{
 const actions=createCollectionActions({read:async()=>({revision:'one',items:[]}),apply:async()=>({cancelled:true})},async()=>true);
 const result=await actions.execute({tool:'langbai_software_action',args:{action:'favorites.local.chooseDirectory',expectedRevision:'one'},sessionId:'s'});
 expect(result.ok).toBe(true);expect((result.data as any).executed).toBe(false);expect((result.data as any).result.cancelled).toBe(true);
});
it('actual HTTP durable replay does not duplicate the collection mutation',async()=>{
 const f=fixture(),execute=vi.fn(f.actions.execute),options={journal:path.join(root,'journal'),tools:['langbai_software_action'],execute};let bridge=await startHarnessBridge(options);
 const call=async(args:Record<string,unknown>,id:string)=>{const res=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN},body:JSON.stringify({tool:'langbai_software_action',args,callId:id,sessionId:'s'})});expect(res.status).toBe(200);return res.json();};
 try{const before=await call({action:'favorites.local.list'},'read'),args={action:'favorites.local.add',id:'history',expectedRevision:before.data.revision};const saved=await call(args,'save');expect(saved.ok).toBe(true);const count=execute.mock.calls.length;
  await bridge.close();bridge=await startHarnessBridge(options);expect(await call(args,'save')).toEqual(saved);expect(execute).toHaveBeenCalledTimes(count);expect((await store.list()).items).toHaveLength(1);
 }finally{await bridge.close();}
});
