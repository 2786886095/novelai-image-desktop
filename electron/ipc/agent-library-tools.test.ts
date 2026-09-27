import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {it,expect,vi,afterAll} from 'vitest';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?`${fixture.root}/app/Studio.exe`:`${fixture.root}/${key}`,getAppPath:()=>fixture.root,getVersion:()=> 'test',isPackaged:false},safeStorage:{isEncryptionAvailable:()=>false},dialog:{showMessageBox:()=>{throw Error('Native confirmation must not be used')}}}));
import {createLibraryTools,desktopLibraryAdapter} from './agent-library-tools';
import {LIBRARY_FIELDS,validateLibraryRequest} from '../../src/agent/library-contract';
import {SOFTWARE_WORKFLOWS} from '../../src/agent/workflow-catalog';
import {normalizeTavernLorebook} from '../../src/tavern/compat';
fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-library-actions-'));
afterAll(()=>fs.rmSync(fixture.root,{recursive:true,force:true}));
it('real local workspace CRUD, recoverable backups and one Agent confirmation per overwrite/delete',async()=>{
 const approve=vi.fn(async()=>true),service=createLibraryTools(desktopLibraryAdapter(),approve);
 const call=(args:Record<string,unknown>)=>service.execute({tool:'langbai_library',args,sessionId:'fixture'});
 for(const collection of Object.keys(LIBRARY_FIELDS)){
  let r=await call({action:'read',collection});expect(r.ok,r.output).toBe(true);
  const patch=collection==='lorebooks'?{name:'Test book',entries:[{id:'e',keys:['rain'],content:'world',insertionOrder:42,position:'before-character'}]}:{name:'Test library',...(['styles','positivePresets'].includes(collection)?{prompt:'rain'}:{})};
  r=await call({action:'create',collection,patch,expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect(fs.existsSync((r.data as any).backupPath)).toBe(true);
  const id=(r.data as any).id;
  r=await call({action:'update',collection,id,patch:{name:'Renamed'},expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);expect((r.data as any).item.name).toBe('Renamed');
  r=await call({action:'delete',collection,id,expectedRevision:(r.data as any).revision});expect(r.ok,r.output).toBe(true);
 }
 expect(approve).toHaveBeenCalledTimes(12);
});
it('cancel leaves data intact; protected/unknown fields never reach persistence',async()=>{
 const adapter=desktopLibraryAdapter(),approve=vi.fn(async()=>false),service=createLibraryTools(adapter,approve),collection='styles';
 const call=(args:Record<string,unknown>)=>service.execute({tool:'langbai_library',args,sessionId:'fixture'});
 let r=await call({action:'read',collection});r=await call({action:'create',collection,patch:{name:'keep',prompt:'x'},expectedRevision:(r.data as any).revision});const data=r.data as any;
 r=await call({action:'delete',collection,id:data.id,expectedRevision:data.revision});expect(r.ok).toBe(false);expect((await adapter.read(collection)).rows.some(x=>x.id===data.id)).toBe(true);
 expect(()=>validateLibraryRequest({action:'create',collection,expectedRevision:'x',patch:{name:'X',prompt:'x',apiKey:'never'}})).toThrow();
 expect(()=>validateLibraryRequest({action:'delete',collection,id:'x',expectedRevision:'x',confirmed:true})).toThrow();
});
it('desktop normalization preserves canonical lorebook position and insertion order',()=>{
 const original=normalizeTavernLorebook({name:'Lore',entries:[{id:'e',content:'x',position:'before-character',insertionOrder:42}]});
 expect(original.entries[0].position).toBe('before-character');expect(original.entries[0].insertionOrder).toBe(42);expect(normalizeTavernLorebook(original)).toEqual(original);
});
it('shared library schemas and user workflows are identical on desktop and Android',()=>{
 const parse=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8').split("r'''")[1].split("'''")[0]);
 expect(parse('mobile/lib/agent/library_fields.dart')).toEqual(LIBRARY_FIELDS);expect(parse('mobile/lib/agent/workflow_catalog.dart')).toEqual(SOFTWARE_WORKFLOWS);
});
