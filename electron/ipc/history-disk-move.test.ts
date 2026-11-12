import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {HistoryItem} from '../../src/types';
const fixture=vi.hoisted(()=>({root:''}));
const tempRoot=fs.realpathSync.native(os.tmpdir());
vi.mock('electron',()=>({app:{getPath:(key:string)=>path.join(fixture.root,key==='exe'?'app/Studio.exe':key),getAppPath:()=>fixture.root,isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},dialog:{},shell:{}}));
let store:typeof import('./store'),storage:typeof import('./storage'),output:string;
beforeEach(async()=>{fixture.root=fs.mkdtempSync(path.join(tempRoot,'studio-works-batch-'));output=path.join(fixture.root,'output');fs.mkdirSync(output);vi.resetModules();store=await import('./store');storage=await import('./storage');store.writeStore({...store.readStore(),history:[],historyGroups:[{id:'a',name:'A',createdAt:'2026-10-10'},{id:'b',name:'B',createdAt:'2026-10-10'}],settings:{...store.getSettings(),outputDir:output}});});
afterEach(()=>{vi.restoreAllMocks();if(path.dirname(path.resolve(fixture.root))!==path.resolve(tempRoot)||!path.basename(fixture.root).startsWith('studio-works-batch-'))throw Error('Unsafe fixture cleanup');fs.rmSync(fixture.root,{recursive:true,force:true});});
function record(id:string,file=path.join(output,id+'.png')){fs.writeFileSync(file,'neutral '+id);const item={id,filePath:file,fileUrl:'',groupId:'a',date:'2026-10-10',createdAt:'2026-10-10',params:{},actualSeed:1,width:1,height:1,model:'nai-diffusion-4-5-full'} as HistoryItem;store.addHistory([item]);return item;}

const date='2026-10-10';
const at=(group:string,name='a.png')=>path.join(output,date,group,name);
function put(group='A',name='a.png',id='a'){
 const file=at(group,name);fs.mkdirSync(path.dirname(file),{recursive:true});
 return record(id,file);
}
it('moves a UI selection on disk and resolves the same ID to the new path',()=>{
 const a=put();const untouched=put('A','b.png','b');const bytes=fs.readFileSync(a.filePath);
 expect(storage.assignHistoryGroup('a','b').ok).toBe(true);
 expect(fs.existsSync(a.filePath)).toBe(false);
 expect(fs.readFileSync(at('B'))).toEqual(bytes);
 expect(fs.readFileSync(untouched.filePath,'utf8')).toBe('neutral b');
 expect(store.getHistory(undefined,'b',true)[0]?.filePath).toBe(at('B'));
});
it('moves a reviewed MCP plan on disk; an existing filename is never overwritten',()=>{
 const a=put();fs.mkdirSync(path.dirname(at('B')),{recursive:true});fs.writeFileSync(at('B'),'keep');
 expect(store.applyMcpHistoryMoves([{id:'a',filePath:a.filePath,from:'a',to:'b'}])).toBe(true);
 expect(fs.existsSync(a.filePath)).toBe(false);
 expect(fs.readFileSync(at('B'),'utf8')).toBe('keep');
 expect(fs.readFileSync(at('B','a_1.png'),'utf8')).toBe('neutral a');
 expect(store.getHistory()[0]?.filePath).toBe(at('B','a_1.png'));
});

it('returns old files to their original locations if the second source is locked',()=>{
 const a=put(),b=put('A','b.png','b');const before=JSON.stringify(store.readStore());
 const unlink=fs.unlinkSync.bind(fs);
 const locked=vi.spyOn(fs,'unlinkSync').mockImplementation((p)=>{
   if(String(p)===b.filePath)throw Object.assign(Error('locked'),{code:'EBUSY'});
   return unlink(p);
 });
 expect(storage.assignHistoryGroup(['a','b'],'b')).toMatchObject({ok:false,message:expect.stringContaining('EBUSY')});
 locked.mockRestore();
 expect(JSON.stringify(store.readStore())).toBe(before);
 expect(fs.readFileSync(a.filePath,'utf8')).toBe('neutral a');
 expect(fs.readFileSync(b.filePath,'utf8')).toBe('neutral b');
 expect(fs.existsSync(at('B'))).toBe(false);
});
it('rejects a junction to another folder and retains the original',()=>{
 const a=put(),outside=path.join(fixture.root,'outside');fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.dirname(at('B')),'junction');
 expect(storage.assignHistoryGroup('a','b').ok).toBe(false);
 expect(fs.readdirSync(outside)).toEqual([]);
 expect(fs.readFileSync(a.filePath,'utf8')).toBe('neutral a');
 expect(store.readStore().history[0]?.groupId).toBe('a');
});
it('repairs a legacy mismatch without requiring moving to a third group first',()=>{
 const a=put();store.updateHistoryItem(a.id,{groupId:'b'});
 expect(storage.assignHistoryGroup(a.id,'b').ok).toBe(true);
 expect(store.getHistory()[0]?.filePath).toBe(at('B'));
 expect(storage.assignHistoryGroup(a.id,'__ungrouped').ok).toBe(true);
 expect(store.getHistory()[0]?.filePath).toBe(path.join(output,date,'a.png'));
 expect(fs.existsSync(at('B'))).toBe(false);
});
it('does not move a source shared with an unselected history record',()=>{
 const a=put();store.addHistory([{...a,id:'b'}]);
 expect(storage.assignHistoryGroup(a.id,'b').ok).toBe(false);
 expect(store.getHistory().every(item=>item.filePath===a.filePath)).toBe(true);
});
