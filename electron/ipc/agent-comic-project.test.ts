import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createComicProjectHost} from './agent-comic-project';
import {createComicProjectStore} from '../../src/comic/project-store';
import {createComicProjectActions} from '../../src/agent/comic-project-actions';
import sharp from 'sharp';import JSZip from 'jszip';
import {DEFAULT_PARAMS} from '../../src/types';
import {startHarnessBridge} from './harness-bridge';
let root:string;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-comic-project-'));});afterEach(()=>fs.rm(root,{recursive:true,force:true}));
function fixture(approve=vi.fn(async()=>true),assets?:Parameters<typeof createComicProjectHost>[3]){
 const values=new Map<string,string>(),store=createComicProjectStore({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}},params:()=>DEFAULT_PARAMS});
 const renderer=createComicProjectActions(store,()=>DEFAULT_PARAMS),host=createComicProjectHost(async args=>(String(args.action).startsWith('_comic.')?renderer.internal(args):renderer.execute(args)) as Record<string,unknown>,approve,()=>path.join(root,'exports'),assets);
 const call=(action:string,args:Record<string,unknown>={})=>host.execute({tool:'langbai_software_action',sessionId:'comic',args:{action,expectedRevision:store.read().revision,...args}});
 return {values,store,host,call,approve};
}
it('ordinary project edits and real JSON export use current software data without confirmation',async()=>{
 const f=fixture();expect((await f.call('comic.project.update',{patch:{title:'作品'}})).ok).toBe(true);expect((await f.call('comic.panels.append',{text:'forest\nrain'})).ok).toBe(true);
 const reply=await f.call('comic.project.export');expect(reply.ok,reply.output).toBe(true);const data=reply.data as any,bytes=await fs.readFile(data.filePath);expect(createHash('sha256').update(bytes).digest('hex')).toBe(data.sha256);expect(JSON.parse(bytes.toString()).panels).toHaveLength(2);expect(JSON.parse(bytes.toString()).title).toBe('作品');expect(f.approve).not.toHaveBeenCalled();
});
it('destructive operations confirm once; denial, aborted approval and UI edits preserve the project',async()=>{
 const f=fixture();await f.call('comic.panels.append',{text:'forest'});f.approve.mockResolvedValueOnce(false);expect((await f.call('comic.project.new')).ok).toBe(false);expect(f.store.read().project.panels).toHaveLength(1);
 f.approve.mockImplementationOnce(async()=>{f.store.update(p=>({...p,title:'用户更改'}));return true;});expect((await f.call('comic.project.new')).ok).toBe(false);expect(f.store.read().project.title).toBe('用户更改');
 const abort=new AbortController();f.approve.mockImplementationOnce(async()=>{abort.abort();return true;});expect((await f.host.execute({tool:'langbai_software_action',sessionId:'comic',signal:abort.signal,args:{action:'comic.project.new',expectedRevision:f.store.read().revision}})).ok).toBe(false);
 expect((await f.call('comic.project.new')).ok).toBe(true);expect(f.approve).toHaveBeenCalledTimes(4);expect(f.store.read().project.panels).toEqual([]);
});
it('export IO error never returns a successful file path',async()=>{
 const f=fixture();await fs.writeFile(path.join(root,'exports'),'not directory');const result=await f.call('comic.project.export');expect(result.ok).toBe(false);expect(result.data).toBeUndefined();
});
it('HTTP durable replay does not repeat a confirmed replacement or overwrite a later UI edit',async()=>{
 const f=fixture();await f.call('comic.panels.append',{text:'first'});let bridge=await startHarnessBridge({journal:path.join(root,'journal'),tools:['langbai_software_action'],execute:f.host.execute});
 const args={action:'comic.panels.replace',text:'second',expectedRevision:f.store.read().revision};
 async function call(){const res=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN},body:JSON.stringify({tool:'langbai_software_action',args,callId:'replace',sessionId:'comic'})});expect(res.status).toBe(200);return res.json();}
 try{const saved=await call();expect(saved.ok).toBe(true);f.store.update(p=>({...p,title:'later UI'}));await bridge.close();bridge=await startHarnessBridge({journal:path.join(root,'journal'),tools:['langbai_software_action'],execute:f.host.execute});expect(await call()).toEqual(saved);expect(f.approve).toHaveBeenCalledTimes(1);expect(f.store.read().project.title).toBe('later UI');}finally{await bridge.close();}
});
async function assetFixture(){
 const file=path.join(root,'registered.png'),bytes=await sharp({create:{width:4,height:3,channels:3,background:'#876'}}).png().toBuffer();await fs.writeFile(file,bytes);
 const importReference=vi.fn(async(_project:string,source:string,id:string)=>{if(source!=='history'||id!=='registered')throw Error('not registered');return {id:'ref-one',name:'registered',filePath:file,fileUrl:'file://private',type:'character' as const,strength:.6,fidelity:.8,informationExtracted:1,scope:'all' as const,scopePanelIds:[]};});
 const f=fixture(vi.fn(async()=>true),{outputRoot:()=>root,importReference});return {...f,file,bytes,importReference};
}
it('registered import attaches bytes without approval; malformed source, internal action and raw paths are rejected',async()=>{
 const f=await assetFixture();expect((await f.call('comic.references.import',{source:'path',sourceId:f.file})).ok).toBe(false);expect(f.importReference).not.toHaveBeenCalled();
 expect((await f.call('_comic.attach-reference',{asset:{filePath:f.file}})).ok).toBe(false);
 expect((await f.call('comic.references.import',{source:'history',sourceId:'registered',filePath:f.file})).ok).toBe(false);
 const r=await f.call('comic.references.import',{source:'history',sourceId:'registered'});expect(r.ok,r.output).toBe(true);expect(f.store.read().project.preciseReferences[0].filePath).toBe(f.file);expect(await fs.readFile(f.file)).toEqual(f.bytes);expect(f.approve).not.toHaveBeenCalled();
});
it('import CAS conflict retains copied file but does not overwrite concurrent UI state',async()=>{
 const f=await assetFixture(),original=f.importReference.getMockImplementation()!;
 f.importReference.mockImplementationOnce(async(...args)=>{const asset=await original(...args);f.store.update(p=>({...p,title:'new UI title'}));return asset;});
 const r=await f.call('comic.references.import',{source:'history',sourceId:'registered'});expect(r.ok).toBe(false);expect(r.output).toContain('已变化');expect(f.store.read().project.preciseReferences).toEqual([]);expect(f.store.read().project.title).toBe('new UI title');expect(await fs.readFile(f.file)).toEqual(f.bytes);
});
it('reference removal denial and approval clear overrides only after confirmation; files and backup remain',async()=>{
 const f=await assetFixture();await f.call('comic.references.import',{source:'history',sourceId:'registered'});await f.call('comic.panels.append',{text:'scene'});const id=f.store.read().project.panels[0].id;
 await f.call('comic.references.panel',{id,referenceId:'ref-one',patch:{enabled:false}});f.approve.mockResolvedValueOnce(false);
 expect((await f.call('comic.references.remove',{id:'ref-one'})).ok).toBe(false);expect(f.store.read().project.preciseReferences).toHaveLength(1);
 expect((await f.call('comic.references.remove',{id:'ref-one'})).ok).toBe(true);expect(f.store.read().project.preciseReferences).toEqual([]);expect(f.store.read().project.panels[0].preciseReferences).toEqual([]);expect([...f.values.entries()].find(([k])=>k.endsWith('before-agent-change'))?.[1]).toContain('ref-one');expect(await fs.readFile(f.file)).toEqual(f.bytes);expect(f.approve).toHaveBeenCalledTimes(2);
});
it('Agent ZIP exports real current selected images with hash and rejects missing image without another ZIP',async()=>{
 const f=await assetFixture();await f.call('comic.panels.append',{text:'forest'});f.store.update(p=>{p.panels[0].selectedCandidateId='c';p.panels[0].candidates=[{id:'c',historyItemId:'h',outputPath:f.file,outputUrl:'file://private',createdAt:'today'}];return p;});
 const result=await f.call('comic.images.export');expect(result.ok,result.output).toBe(true);const data=result.data as any,bytes=await fs.readFile(data.filePath),zip=await JSZip.loadAsync(bytes,{checkCRC32:true});expect(data.imageCount).toBe(1);expect(createHash('sha256').update(bytes).digest('hex')).toBe(data.sha256);expect(await zip.file('images/001.png')!.async('nodebuffer')).toEqual(f.bytes);expect(await zip.file('project.json')!.async('string')).not.toContain(root);
 await fs.unlink(f.file);expect((await f.call('comic.images.export')).ok).toBe(false);expect(await fs.readdir(path.join(root,'exports'))).toHaveLength(1);expect(f.approve).not.toHaveBeenCalled();
});
it('selected ZIP requires a revision and unavailable adapters fail without success paths',async()=>{
 const f=fixture();expect((await f.call('comic.images.export',{expectedRevision:undefined})).output).toContain('expectedRevision');expect((await f.call('comic.references.import',{source:'history',sourceId:'registered'})).ok).toBe(false);
});
it('five-reference cap rejects import before copying another file',async()=>{const f=await assetFixture();const asset=await f.importReference('project','history','registered');f.importReference.mockClear();f.store.update(p=>({...p,preciseReferences:Array.from({length:5},(_,i)=>({...asset,id:'ref-'+i}))}));expect((await f.call('comic.references.import',{source:'history',sourceId:'registered'})).output).toContain('最多5张');expect(f.importReference).not.toHaveBeenCalled();});
it('status and run-bound stop use the shared queue transport, bypass pending confirmation and reject arbitrary internal actions',async()=>{
 let finish!:(ok:boolean)=>void;const pendingApproval=new Promise<boolean>(resolve=>finish=resolve);
 const ask=vi.fn(async(args:Record<string,unknown>):Promise<Record<string,unknown>>=>args.action==='comic.project.read'?{revision:'r',busy:false}:args.action==='_comic.generation.status'?{id:'run',phase:'running'}:args.action==='_comic.generation.stop'?{id:'run',phase:'stopping',cancellationRequested:true}:{executed:true});
 const approve=vi.fn(()=>pendingApproval),host=createComicProjectHost(ask,approve,()=>root);
 const call=(args:Record<string,unknown>)=>host.execute({tool:'langbai_software_action',sessionId:'comic',args});
 const held=call({action:'comic.project.new',expectedRevision:'r'});await vi.waitFor(()=>expect(approve).toHaveBeenCalledTimes(1));
 expect((await call({action:'comic.generation.status'})).data).toMatchObject({id:'run',phase:'running'});
 expect((await call({action:'comic.generation.stop',runId:'run'})).data).toMatchObject({cancellationRequested:true});
 expect(ask).toHaveBeenCalledWith({action:'_comic.generation.stop',runId:'run'});expect((await call({action:'comic.generation.stop'})).ok).toBe(false);expect((await call({action:'_comic.generation.stop',runId:'run'})).ok).toBe(false);
 finish(false);await held;expect(approve).toHaveBeenCalledTimes(1);
});
