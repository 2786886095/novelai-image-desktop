import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?path.join(fixture.root,'app','Studio.exe'):path.join(fixture.root,key),getAppPath:()=>path.join(fixture.root,'app'),isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},dialog:{showMessageBox:()=>{throw Error('Unexpected native confirmation');}}}));
import {addHistory,getHistory,setSetting,writeStore,readStore} from './store';
import {deleteHistoryItem,renameHistoryItem} from './storage';
import {createSoftwareActions} from './software-actions';
import {createImageApprovals} from './harness-image-approval';
fixture.root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'studio-delete-delivery-')));
let output:string;
beforeEach(async()=>{output=await fs.mkdtemp(path.join(fixture.root,'output-'));setSetting('outputDir',output);writeStore({...readStore(),history:[]});});
afterAll(()=>fs.rm(fixture.root,{recursive:true,force:true}));
async function record(id:string,filePath=path.join(output,id+'.png')){await fs.writeFile(filePath,'synthetic '+id);addHistory([{id,filePath,fileUrl:'',date:'2026-09-28',createdAt:new Date().toISOString(),params:{}} as any]);return filePath;}
it('keeps the record and reports failure when a managed file cannot be removed',async()=>{
 const file=await record('denied');const unlink=vi.spyOn(fs,'unlink').mockRejectedValueOnce(Object.assign(Error('synthetic access denied'),{code:'EACCES'}));
 try{expect((await deleteHistoryItem('denied')).ok).toBe(false);expect(getHistory().map(x=>x.id)).toContain('denied');expect(await fs.readFile(file,'utf8')).toBe('synthetic denied');}finally{unlink.mockRestore();}
});
it('removes a missing-file record and deletes a regular managed file',async()=>{
 const missing=await record('missing');await fs.unlink(missing);expect((await deleteHistoryItem('missing')).ok).toBe(true);
 const file=await record('normal');expect((await deleteHistoryItem('normal')).ok).toBe(true);await expect(fs.access(file)).rejects.toThrow();expect(getHistory()).toEqual([]);
});
it('does not delete a file shared by another history record',async()=>{
 const file=await record('shared');addHistory([{...getHistory()[0],id:'also-shared'}]);expect((await deleteHistoryItem('shared')).ok).toBe(true);expect(await fs.readFile(file,'utf8')).toBe('synthetic shared');expect(getHistory().map(x=>x.id)).toEqual(['also-shared']);
});
it('never follows a directory junction outside the managed output',async()=>{
 const outside=await fs.mkdtemp(path.join(fixture.root,'outside-'));const original=path.join(outside,'outside.png');await fs.writeFile(original,'outside bytes');const link=path.join(output,'junction');await fs.symlink(outside,link,'junction');
 addHistory([{id:'junction',filePath:path.join(link,'outside.png'),fileUrl:'',date:'2026-09-28',createdAt:new Date().toISOString(),params:{}} as any]);
 expect((await deleteHistoryItem('junction')).ok).toBe(false);expect(await fs.readFile(original,'utf8')).toBe('outside bytes');expect(getHistory()).toHaveLength(1);
});
it('serializes deletion with rename and repeated deletion for the same identity',async()=>{
 const file=await record('race');let release!:()=>void;const gate=new Promise<void>(r=>release=r);const original=fs.unlink.bind(fs);const unlink=vi.spyOn(fs,'unlink').mockImplementation(async p=>{await gate;return original(p);});
 try{const pending=deleteHistoryItem('race');expect((await deleteHistoryItem('race')).ok).toBe(false);expect((await renameHistoryItem('race','renamed')).ok).toBe(false);release();expect((await pending).ok).toBe(true);await expect(fs.access(file)).rejects.toThrow();}finally{release();unlink.mockRestore();}
});
it('does not modify storage when the request is stopped during approval',async()=>{
 const file=await record('stopped');const controller=new AbortController();const service=createSoftwareActions(async()=>{controller.abort();return true;});
 const before=await service.execute({tool:'langbai_software_action',args:{action:'history.items.list'}});
 const result=await service.execute({tool:'langbai_software_action',args:{action:'history.items.delete',id:'stopped',expectedRevision:before.data!.revision},signal:controller.signal});expect(result.ok).toBe(false);expect(await fs.readFile(file,'utf8')).toBe('synthetic stopped');expect(getHistory()).toHaveLength(1);
});
it('Agent delete uses one approval, supports denial, rejects stale revisions, and reads actual disk back',async()=>{
 const file=await record('agent');const approvals=createImageApprovals(2000);const service=createSoftwareActions(r=>approvals.wait(r));let serial=0;
 const request=(tool:string,args:Record<string,unknown>)=>({tool,args,sessionId:'delete-session',callId:'delete-'+(++serial)});
 const call=(args:Record<string,unknown>)=>service.execute(request('langbai_software_action',args));
 try{
  const state=await call({action:'history.items.list'});const args={action:'history.items.delete',id:'agent',expectedRevision:state.data!.revision};
  const denied=call(args);await vi.waitFor(()=>expect(approvals.execute(request('studio_image_approval',{})).data).not.toBeNull());let pending=approvals.execute(request('studio_image_approval',{})).data!;
  approvals.execute(request('studio_resolve_image_approval',{id:pending.id,approved:false}));expect((await denied).ok).toBe(false);expect(await fs.readFile(file,'utf8')).toBe('synthetic agent');
  const accepted=call(args);await vi.waitFor(()=>expect(approvals.execute(request('studio_image_approval',{})).data).not.toBeNull());pending=approvals.execute(request('studio_image_approval',{})).data!;
  approvals.execute(request('studio_resolve_image_approval',{id:pending.id,approved:true}));const result=await accepted;expect(result.ok,result.output).toBe(true);expect(result.data).toMatchObject({executed:true,total:0});await expect(fs.access(file)).rejects.toThrow();
  expect(approvals.execute(request('studio_image_approval',{})).data).toBeNull();expect((await call(args)).ok).toBe(false);
 }finally{approvals.close();}
});
