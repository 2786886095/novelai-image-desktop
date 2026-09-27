import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {it,expect,vi,afterAll} from 'vitest';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?`${fixture.root}/app/Studio.exe`:`${fixture.root}/${key}`,getAppPath:()=>fixture.root,isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},dialog:{showMessageBox:()=>{throw Error('Native confirmation must not be used')}}}));
import {createSoftwareActions,verifySoftwareAction} from './software-actions';
import {createImageApprovals} from './harness-image-approval';
import {createHistoryGroup,addTextToolHistoryItem} from './store';
import {saveReferencePreset} from './reference-presets';
fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-actions-'));
afterAll(()=>fs.rmSync(fixture.root,{recursive:true,force:true}));
const request=(tool:string,args:Record<string,unknown>={})=>({tool,args,sessionId:'integration',callId:'integration-call'});
it('real persistent storage: direct edits, stale write rejection, Agent confirmation, readback and cancellation',async()=>{
 const approvals=createImageApprovals(2000),gateway=createSoftwareActions(r=>approvals.wait(r));
 const call=(args:Record<string,unknown>)=>gateway.execute(request('langbai_software_action',args));
 let r=await call({action:'history.groups.list'});expect(r.ok,r.output).toBe(true);
 const first=(r.data as any).revision;
 r=await call({action:'history.groups.create',name:'Test',expectedRevision:first});expect(r.ok,r.output).toBe(true);
 expect(approvals.execute(request('studio_image_approval')).data).toBeNull();
 const data=r.data as any;const id=data.readback.find((g:any)=>g.name==='Test').id;
 expect(fs.readFileSync(path.join(fixture.root,'userData','novelai-image-desktop.json'),'utf8')).toContain('Test');
 expect((await call({action:'history.groups.rename',id,name:'Stale',expectedRevision:first})).ok).toBe(false);
 const deletion=call({action:'history.groups.delete',id,expectedRevision:data.revision});
 await vi.waitFor(()=>expect(approvals.execute(request('studio_image_approval')).data).not.toBeNull());
 let pending=approvals.execute(request('studio_image_approval')).data!;
 expect((await call({action:'history.groups.list'})).data).toMatchObject({total:1});
 approvals.execute(request('studio_resolve_image_approval',{id:pending.id,approved:false}));
 expect((await deletion).ok).toBe(false);
 const again=call({action:'history.groups.delete',id,expectedRevision:data.revision});
 await vi.waitFor(()=>expect(approvals.execute(request('studio_image_approval')).data).not.toBeNull());
 pending=approvals.execute(request('studio_image_approval')).data!;
 approvals.execute(request('studio_resolve_image_approval',{id:pending.id,approved:true}));
 r=await again;expect(r.ok,r.output).toBe(true);expect(r.data).toMatchObject({executed:true,total:0});
 expect(JSON.parse(fs.readFileSync(path.join(fixture.root,'userData','novelai-image-desktop.json'),'utf8')).historyGroups).toEqual([]);
 approvals.close();
});
it('rechecks revision after UI consent and refuses stale operation',async()=>{
 const gateway=createSoftwareActions(async()=>{createHistoryGroup('concurrent edit');return true});
 const read=await gateway.execute(request('langbai_software_action',{action:'history.groups.list'}));
 const r=await gateway.execute(request('langbai_software_action',{action:'text.convert.clear',expectedRevision:(read.data as any).revision}));
 expect(r.ok).toBe(false);
 // Same category revision, changed while user is deciding.
 const groups=createHistoryGroup('protected');const before=await gateway.execute(request('langbai_software_action',{action:'history.groups.list'}));
 const result=await gateway.execute(request('langbai_software_action',{action:'history.groups.delete',id:groups.at(-1)!.id,expectedRevision:(before.data as any).revision}));
 expect(result.ok).toBe(false);expect(result.output).toContain('确认期间');
});
it('reference groups return group names, not preset rows, from real storage',async()=>{
 const gateway=createSoftwareActions(async()=>true);
 const call=(args:Record<string,unknown>)=>gateway.execute(request('langbai_software_action',args));
 let r=await call({action:'references.groups.list'});
 r=await call({action:'references.groups.create',name:'Animals',expectedRevision:(r.data as any).revision});
 expect(r.ok,r.output).toBe(true);expect((r.data as any).readback).toContain('Animals');
 r=await call({action:'references.groups.delete',name:'Animals',expectedRevision:(r.data as any).revision});
 expect(r.ok,r.output).toBe(true);expect((r.data as any).readback).not.toContain('Animals');
});
it('postconditions catch silent no-op; injection and unknown commands never execute',async()=>{
 expect(()=>verifySoftwareAction('history.groups.delete',{id:'x'},{groups:[{id:'x'}],items:[]})).toThrow(/回读/);
 const approve=vi.fn(async()=>true),gateway=createSoftwareActions(approve);
 expect((await gateway.execute(request('langbai_software_action',{action:'shell.exec',command:'anything'}))).ok).toBe(false);
 expect(approve).not.toHaveBeenCalled();
});

it('convert/reverse history deletion and clearing persist and stay in their category',async()=>{
 const gateway=createSoftwareActions(async()=>true);
 const call=(args:Record<string,unknown>)=>gateway.execute(request('langbai_software_action',args));
 for(const kind of ['convert','reverse'] as const){
  for(const id of ['one','two'])addTextToolHistoryItem(kind,{id,mode:'mixed',knownCharacter:false,input:'test',result:'test result',createdAt:new Date().toISOString()});
  let r=await call({action:`text.${kind}.list`});expect((r.data as any).total).toBe(2);
  r=await call({action:`text.${kind}.delete`,id:'one',expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect((r.data as any).total).toBe(1);
  r=await call({action:`text.${kind}.clear`,expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect((r.data as any).total).toBe(0);
  expect(JSON.parse(fs.readFileSync(path.join(fixture.root,'userData','novelai-image-desktop.json'),'utf8'))[kind+'History']).toEqual([]);
 }
});
it('reference moves and group deletion preserve files; approved preset deletion removes only its saved copy',async()=>{
 const saved=await saveReferencePreset({name:'fixture',kind:'vibe',group:'Source',base64:Buffer.from('storage fixture').toString('base64'),extension:'.png'});
 expect(saved.ok).toBe(true);const id=saved.preset!.id,file=saved.preset!.filePath;
 const gateway=createSoftwareActions(async()=>true);const call=(args:Record<string,unknown>)=>gateway.execute(request('langbai_software_action',args));
 let r=await call({action:'references.list'});
 r=await call({action:'references.move',id,group:'Target',expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect(fs.existsSync(file)).toBe(true);
 r=await call({action:'references.groups.delete',name:'Target',expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect(fs.existsSync(file)).toBe(true);
 r=await call({action:'references.delete',id,expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect(fs.existsSync(file)).toBe(false);
});
