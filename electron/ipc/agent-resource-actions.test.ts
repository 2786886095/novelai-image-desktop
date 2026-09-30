import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {afterAll,it,expect,vi} from 'vitest';
const fixture=vi.hoisted(()=>({root:'',open:vi.fn(async()=>'' )}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root,isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},BrowserWindow:{getAllWindows:()=>[]},shell:{openPath:fixture.open}}));
import {createResourceActions,desktopResourceAdapter,type ResourceActionAdapter} from './agent-resource-actions';
fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-resource-agent-'));
afterAll(()=>fs.rm(fixture.root,{recursive:true,force:true}));
let i=0;const req=(args:Record<string,unknown>)=>({tool:'langbai_software_action',args,sessionId:'resources',callId:'call-'+(++i)});
function fake(){let installed=false,version='',cached=3;let finish!:(x:any)=>void;const adapter:ResourceActionAdapter={
 overview:async()=>({dataDirectory:'isolated',resources:[{id:'tagCatalog',installed,valid:installed,version,hasPrevious:true,downloading:false} as any],cache:{memoryEntries:cached,memoryHits:2,memoryMisses:1,memoryHitRate:2/3}}),
 download:vi.fn(()=>new Promise(r=>{finish=r;})),pause:vi.fn(()=>{finish({ok:false,paused:true,message:'paused'});return {ok:true};}),
 restore:vi.fn(async()=>{installed=true;version='old';return {ok:true,message:'restored'};}),clearCache:()=>{cached=0;return {ok:true};},openDirectory:async()=>({ok:true})};
 return {adapter,complete:()=>{installed=true;version='new';finish({ok:true,message:'installed'});}};
}
it('starts after one confirmation, returns before download ends, allows pause and never calls started complete',async()=>{
 const {adapter}=fake(),approve=vi.fn(async()=>true),actions=createResourceActions(adapter,approve);const state=await actions.execute(req({action:'resources.list'}));
 const started=await actions.execute(req({action:'resources.download',id:'tagCatalog',expectedRevision:state.data!.revision}));expect(started.ok,started.output).toBe(true);expect((started.data as any).result.started).toBe(true);expect((started.data as any).jobs[0].state).toBe('running');expect(approve).toHaveBeenCalledTimes(1);
 expect((await actions.execute(req({action:'resources.download',id:'tagCatalog',expectedRevision:state.data!.revision}))).ok).toBe(false);
 expect((await actions.execute(req({action:'resources.pause',id:'tagCatalog',expectedRevision:state.data!.revision}))).ok).toBe(true);
 await vi.waitFor(async()=>expect((await actions.execute(req({action:'resources.list'}))).data!.jobs[0].state).toBe('paused'));expect(approve).toHaveBeenCalledTimes(1);
});
it('denial and stale revision do not install; readback is required for completion',async()=>{
 const {adapter,complete}=fake(),approve=vi.fn(async()=>false),actions=createResourceActions(adapter,approve);const state=await actions.execute(req({action:'resources.list'}));
 expect((await actions.execute(req({action:'resources.download',id:'tagCatalog',expectedRevision:'stale'}))).ok).toBe(false);expect(approve).not.toHaveBeenCalled();
 expect((await actions.execute(req({action:'resources.download',id:'tagCatalog',expectedRevision:state.data!.revision}))).ok).toBe(false);expect(adapter.download).not.toHaveBeenCalled();
 approve.mockResolvedValue(true);await actions.execute(req({action:'resources.download',id:'tagCatalog',expectedRevision:state.data!.revision}));complete();
 await vi.waitFor(async()=>expect((await actions.execute(req({action:'resources.list'}))).data!.jobs[0].state).toBe('complete'));
});
it('real SQLite previous version restore, durable readback, source retention, cache and folder actions',async()=>{
 const adapter=desktopResourceAdapter(),state=await adapter.overview(),file=path.join(state.dataDirectory,'tag_catalog.db.previous');
 const sql=new DatabaseSync(file);sql.exec("CREATE TABLE metadata(key TEXT,value TEXT); INSERT INTO metadata VALUES('schema_version','2'),('data_version','fixture-old'),('tag_count','1'); CREATE TABLE tags(id INTEGER,name TEXT,category INTEGER,post_count INTEGER); INSERT INTO tags VALUES(1,'sky',0,1); CREATE TABLE aliases(tag_id INTEGER,alias TEXT); CREATE TABLE tag_search(term TEXT,search_key TEXT,tag_id INTEGER,kind TEXT);");sql.close();
 const approve=vi.fn(async()=>true),actions=createResourceActions(adapter,approve);const before=await actions.execute(req({action:'resources.list'}));
 const restored=await actions.execute(req({action:'resources.restore',id:'tagCatalog',expectedRevision:before.data!.revision}));expect(restored.ok,restored.output).toBe(true);expect((restored.data as any).result.version).toBe('fixture-old');expect(approve).toHaveBeenCalledTimes(1);
 expect((await fs.readFile(path.join(state.dataDirectory,'tag_catalog.db'))).equals(await fs.readFile(file))).toBe(true);
 for(const action of ['resources.clearCache','resources.openDirectory']){const latest=await actions.execute(req({action:'resources.list'}));expect((await actions.execute(req({action,expectedRevision:latest.data!.revision}))).ok).toBe(true);}
 expect(fixture.open).toHaveBeenCalledWith(state.dataDirectory);
 const readback=await createResourceActions(desktopResourceAdapter(),approve).execute(req({action:'resources.list'}));expect(readback.data!.resources[0].version).toBe('fixture-old');
});
it('core reserves its operation before the first await, so concurrent UI/Agent restore cannot share staging files',async()=>{
 const adapter=desktopResourceAdapter();const results=await Promise.all([adapter.restore('cooccurrence'),adapter.restore('cooccurrence')]);expect(results[1]).toMatchObject({ok:false});expect(results[1].message).toContain('正在处理');expect(results[0].ok).toBe(false);
});
