import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?path.join(fixture.root,'app','Studio.exe'):path.join(fixture.root,key),getAppPath:()=>path.join(fixture.root,'app'),isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},dialog:{showMessageBox:()=>{throw Error('Unexpected native confirmation');}}}));
import {addHistory,getHistory,setSetting,writeStore,readStore} from './store';
import {deleteHistoryItem,renameHistoryItem} from './storage';
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
