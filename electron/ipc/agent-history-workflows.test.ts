import fs from 'node:fs/promises';import syncFs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import JSZip from 'jszip';
import {afterAll,beforeEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({root:'',reveal:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?path.join(fixture.root,'app','Studio.exe'):path.join(fixture.root,key),getAppPath:()=>path.join(fixture.root,'app'),isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},shell:{showItemInFolder:fixture.reveal},dialog:{showSaveDialog:()=>{throw Error('Unexpected native confirmation');}}}));
import {addHistory,getHistory,setSetting,writeStore,readStore,createHistoryGroup} from './store';
import {renameHistoryItem} from './storage';
import {createSoftwareActions} from './software-actions';
import {startHarnessBridge} from './harness-bridge';
fixture.root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'studio-agent-history-')));let output:string;
beforeEach(async()=>{output=await fs.mkdtemp(path.join(fixture.root,'output-'));setSetting('outputDir',output);writeStore({...readStore(),history:[],historyGroups:[]});fixture.reveal.mockClear();});
afterAll(()=>fs.rm(fixture.root,{recursive:true,force:true}));
async function record(id:string,groupId?:string){const filePath=path.join(output,id+'.png');await fs.writeFile(filePath,'original metadata '+id);addHistory([{id,filePath,fileUrl:'',model:'fixture',width:2,height:3,date:'2026-09-28',createdAt:new Date().toISOString(),groupId,params:{prompt:'synthetic',apiKey:'not-exported'}} as any]);return filePath;}
function actions(){const approve=vi.fn(async()=>{throw Error('Ordinary rename/export should not request approval');});const service=createSoftwareActions(approve);return {approve,call:(args:Record<string,unknown>)=>service.execute({tool:'langbai_software_action',args})};}
it('Agent renames an actual file without extra confirmation, returns actual destination, and rejects stale state',async()=>{
 const source=await record('rename'),{call,approve}=actions(),state=await call({action:'history.items.list'});
 const args={action:'history.items.rename',id:'rename',name:'Evening',expectedRevision:state.data!.revision};const reply=await call(args);expect(reply.ok,reply.output).toBe(true);
 expect(getHistory()[0].filePath).toBe(path.join(output,'Evening.png'));expect(await fs.readFile(getHistory()[0].filePath,'utf8')).toBe('original metadata rename');await expect(fs.access(source)).rejects.toThrow();expect((reply.data as any).result.filePath).toBe(getHistory()[0].filePath);expect(approve).not.toHaveBeenCalled();expect((await call(args)).ok).toBe(false);
});
it('exports only selected group, verifies zip bytes, retains receipts across service restart and opens by receipt ID',async()=>{
 const group=createHistoryGroup('景色')[0];await record('in',group.id);await record('out');const {call,approve}=actions();const before=await call({action:'history.items.list'});
 const reply=await call({action:'history.groups.export',group:group.id,expectedRevision:before.data!.revision});expect(reply.ok,reply.output).toBe(true);const receipt=(reply.data as any).result;
 const bytes=await fs.readFile(receipt.filePath);expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.sha256);expect(receipt.count).toBe(1);const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});const files=Object.values(zip.files).filter(x=>!x.dir&&x.name.endsWith('.png'));expect(files).toHaveLength(1);expect(await files[0].async('string')).toBe('original metadata in');expect(await zip.file('project.json')!.async('string')).not.toContain('not-exported');
 const fresh=actions(),list=await fresh.call({action:'history.exports.list'});expect(list.ok,list.output).toBe(true);expect((list.data!.readback as any[]).some(x=>x.id===receipt.id)).toBe(true);
 const opened=await fresh.call({action:'history.exports.open',id:receipt.id,expectedRevision:list.data!.revision});expect(opened.ok,opened.output).toBe(true);expect(fixture.reveal).toHaveBeenCalledWith(receipt.filePath);expect(approve).not.toHaveBeenCalled();
 await fs.writeFile(receipt.filePath,'corrupted');const updated=await fresh.call({action:'history.exports.list'});expect((await fresh.call({action:'history.exports.open',id:receipt.id,expectedRevision:updated.data!.revision})).ok).toBe(false);expect(fixture.reveal).toHaveBeenCalledTimes(1);
});
it('a missing image rejects the complete export rather than claiming a partial archive',async()=>{
 const source=await record('missing');await fs.unlink(source);const {call}=actions(),before=await call({action:'history.items.list'}),exports=await call({action:'history.exports.list'});
 const reply=await call({action:'history.groups.export',group:'',expectedRevision:before.data!.revision});expect(reply.ok).toBe(false);const after=await call({action:'history.exports.list'});expect(after.ok,after.output).toBe(true);expect(after.data!.revision).toBe(exports.data!.revision);
});
it('shared source stays available to other history rows after rename',async()=>{
 const source=await record('shared');addHistory([{...getHistory()[0],id:'second'}]);const result=await renameHistoryItem('shared','New');expect(result.ok,result.message).toBe(true);expect(await fs.readFile(source,'utf8')).toBe('original metadata shared');expect(await fs.readFile(getHistory().find(x=>x.id==='shared')!.filePath,'utf8')).toBe('original metadata shared');
});
it('failed index persistence retains source and original history without an orphaned rename',async()=>{
 const source=await record('persist');const spy=vi.spyOn(syncFs,'renameSync').mockImplementation(()=>{throw Error('synthetic store write failure');});
 try{await expect(renameHistoryItem('persist','Changed')).resolves.toMatchObject({ok:false});}finally{spy.mockRestore();}
 expect(getHistory()[0].filePath).toBe(source);expect(await fs.readFile(source,'utf8')).toBe('original metadata persist');await expect(fs.access(path.join(output,'Changed.png'))).rejects.toThrow();
});
it('real HTTP bridge journals rename and ZIP export exactly once across restart',async()=>{
 await record('http');const service=createSoftwareActions(async()=>{throw Error('Unexpected approval');});
 const execute=vi.fn(service.execute),options={journal:path.join(output,'journal'),tools:['langbai_software_action','langbai_software_capabilities'],execute};
 let bridge=await startHarnessBridge(options);
 const call=async(args:Record<string,unknown>,callId:string)=>{const res=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN},body:JSON.stringify({tool:'langbai_software_action',args,callId,sessionId:'history'})});expect(res.status).toBe(200);return res.json();};
 try{
  const state=await call({action:'history.items.list'},'list');
  const rename={action:'history.items.rename',id:'http',name:'HTTP-Renamed',expectedRevision:state.data.revision};
  expect((await call(rename,'rename')).ok).toBe(true);
  const current=await call({action:'history.items.list'},'list2');
  const args={action:'history.groups.export',group:'',expectedRevision:current.data.revision};
  const exported=await call(args,'export');expect(exported.ok,exported.output).toBe(true);
  const invocations=execute.mock.calls.length;await bridge.close();bridge=await startHarnessBridge(options);
  expect((await call(rename,'rename')).ok).toBe(true);
  expect((await call(args,'export')).data.result).toEqual(exported.data.result);expect(execute).toHaveBeenCalledTimes(invocations);
  const list=await call({action:'history.exports.list'},'exports');
  expect(list.data.readback.filter((x:any)=>x.id===exported.data.result.id)).toHaveLength(1);
  expect(await fs.readFile(path.join(output,'HTTP-Renamed.png'),'utf8')).toBe('original metadata http');
 }finally{await bridge.close();}
});
