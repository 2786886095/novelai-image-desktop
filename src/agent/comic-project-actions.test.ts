import {expect,it} from 'vitest';
import {createComicProjectStore,COMIC_BACKUP_KEY} from '../comic/project-store';
import {createComicProjectActions} from './comic-project-actions';
import {DEFAULT_PARAMS} from '../types';
function fixture(){const values=new Map<string,string>(),store=createComicProjectStore({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);}},params:()=>DEFAULT_PARAMS});const api=createComicProjectActions(store,()=>DEFAULT_PARAMS);const call=(action:string,args:Record<string,unknown>={})=>api.execute({action,expectedRevision:store.read().revision,...args}) as any;return {values,store,api,call};}
it('edits actual global settings, appends/updates/reorders panels and paginates readback',()=>{
 const f=fixture();f.call('comic.project.update',{patch:{title:'雨夜',globalParams:{steps:28},globalStylePrompt:'soft light'}});
 const added=f.call('comic.panels.append',{text:'1girl, rain\n1girl, sunset'});expect(added.total).toBe(2);const ids=f.store.read().project.panels.map(p=>p.id);
 f.call('comic.panels.update',{id:ids[0],patch:{title:'第一格',prompt:'1girl, street'}});f.call('comic.panels.reorder',{order:[ids[1],ids[0]]});
 const read=f.call('comic.project.read',{limit:1});expect(read.project.title).toBe('雨夜');expect(read.project.globalParams.steps).toBe(28);expect(read.panels[0].id).toBe(ids[1]);expect(read.nextOffset).toBe(1);
 expect(f.store.read().project.panels[1].index).toBe(2);
});
it('rejects invalid fields, fake output paths, invalid order and stale revisions',()=>{
 const f=fixture(),revision=f.store.read().revision;f.call('comic.panels.append',{text:'forest'});const id=f.store.read().project.panels[0].id;
 expect(()=>f.call('comic.project.update',{patch:{globalParams:{apiKey:'x'}}})).toThrow();expect(()=>f.call('comic.panels.update',{id,patch:{candidates:[{outputPath:'C:/private'}]}})).toThrow();
 expect(()=>f.call('comic.panels.reorder',{order:[]})).toThrow();expect(()=>f.api.execute({action:'comic.project.new',expectedRevision:revision})).toThrow('已变化');expect(f.store.read().project.panels).toHaveLength(1);
});
it('imports portable project with new identities and excludes local references and outputs',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest'});const old=f.store.read().project;
 const input={...old,id:'../untrusted',apiKey:'never',globalParams:{...old.globalParams,token:'not-exported'},preciseReferences:[{id:'r',filePath:'C:/private',fileUrl:'file:///C:/private'}],panels:old.panels.map(p=>({...p,candidates:[{id:'c',outputPath:'C:/private',outputUrl:'file:///C:/private'}]}))};
 f.call('comic.project.import',{project:input});const current=f.store.read().project;expect(current.id).not.toBe(input.id);expect(current.panels[0].id).not.toBe(old.panels[0].id);expect(current.preciseReferences).toEqual([]);expect(current.panels[0].candidates).toEqual([]);
 expect(JSON.parse(f.values.get(COMIC_BACKUP_KEY)!).id).toBe(old.id);const exported=f.call('comic.project.export');expect(exported.json).not.toContain('C:/private');expect(exported.json).not.toContain('not-exported');
});
it('selects only existing candidates; panel removal preserves backup and removes reference scope IDs',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest'});const id=f.store.read().project.panels[0].id;
 f.store.update(p=>({...p,panels:p.panels.map(x=>({...x,candidates:[{id:'candidate',outputPath:'fixture.png',outputUrl:'fixture://image',historyItemId:'h',createdAt:'today'}]})),preciseReferences:[{id:'r',name:'r',filePath:'reference.png',fileUrl:'fixture://ref',type:'character',strength:1,fidelity:1,informationExtracted:1,scope:'include',scopePanelIds:[id]}]}));
 expect(()=>f.call('comic.candidates.select',{id,candidateId:'fake'})).toThrow();f.call('comic.candidates.select',{id,candidateId:'candidate'});expect(f.store.read().project.panels[0].selectedCandidateId).toBe('candidate');
 f.call('comic.panels.remove',{id});expect(f.store.read().project.panels).toEqual([]);expect(f.store.read().project.preciseReferences[0].scopePanelIds).toEqual([]);expect(JSON.parse(f.values.get(COMIC_BACKUP_KEY)!).panels[0].candidates).toHaveLength(1);
});
it('uses exact per-panel size import and rejects edits during active UI generation',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest\nsea'});f.call('comic.panels.sizes',{text:'832x1216\n1216x832'});expect(f.store.read().project.sizeMode).toBe('perPanel');expect(f.store.read().project.panels[1].imageSize?.width).toBe(1216);
 f.store.setBusy(true);expect(()=>f.call('comic.panels.append',{text:'city'})).toThrow('任务');expect(f.call('comic.project.read').busy).toBe(true);
});

it('sets global comic reference scope and per-panel overrides in actual project',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest\nsea'});const id=f.store.read().project.panels[0].id;
 f.store.update(p=>({...p,preciseReferences:[{id:'reference',name:'ref',filePath:'image.png',fileUrl:'fixture://ref',type:'character',strength:1,fidelity:1,informationExtracted:1,scope:'all',scopePanelIds:[]}]}));
 f.call('comic.references.update',{id:'reference',patch:{scope:'include',scopePanelIds:[id],strength:.6}});
 expect(f.store.read().project.preciseReferences[0]).toMatchObject({scope:'include',scopePanelIds:[id],strength:.6});
 f.call('comic.references.panel',{id,referenceId:'reference',patch:{enabled:false}});
 expect(f.store.read().project.panels[0].preciseReferences[0]).toMatchObject({referenceId:'reference',enabled:false});
});
it('removes comic reference metadata with backup without deleting any image',()=>{
 const f=fixture();f.store.update(p=>({...p,preciseReferences:[{id:'reference',name:'ref',filePath:'image.png',fileUrl:'fixture://ref',type:'character',strength:1,fidelity:1,informationExtracted:1,scope:'all',scopePanelIds:[]}]}));
 const result=f.call('comic.references.remove',{id:'reference'});expect(result.filesRetained).toBe(true);expect(f.store.read().project.preciseReferences).toEqual([]);expect(JSON.parse(f.values.get(COMIC_BACKUP_KEY)!).preciseReferences).toHaveLength(1);
});

it('reference mutations reject path injection, wrong panel IDs and numeric clamping',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest'});f.store.update(p=>({...p,preciseReferences:[{id:'ref',name:'ref',filePath:'one.png',fileUrl:'fixture://ref',type:'character',strength:1,fidelity:1,informationExtracted:1,scope:'all',scopePanelIds:[]}]}));
 const before=JSON.stringify(f.store.read().project);
 for(const patch of [{filePath:'C:/private'},{strength:2},{type:'anything'},{scopePanelIds:['missing']},{scopePanelIds:[f.store.read().project.panels[0].id,f.store.read().project.panels[0].id]}])expect(()=>f.call('comic.references.update',{id:'ref',patch})).toThrow();
 expect(JSON.stringify(f.store.read().project)).toBe(before);
});
it('resetting a per-panel reference restores scope inheritance rather than disabling it',()=>{
 const f=fixture();f.call('comic.panels.append',{text:'forest'});const id=f.store.read().project.panels[0].id;
 f.store.update(p=>({...p,preciseReferences:[{id:'ref',name:'ref',filePath:'one.png',fileUrl:'fixture://ref',type:'character',strength:1,fidelity:1,informationExtracted:1,scope:'all',scopePanelIds:[]}]}));
 f.call('comic.references.panel',{id,referenceId:'ref',patch:{enabled:false,strength:.3}});f.call('comic.references.panel.reset',{id,referenceId:'ref'});expect(f.store.read().project.panels[0].preciseReferences).toEqual([]);
});
it('accepts comic initial generation action with explicit panel selection and project revision',async()=>{const {validateComicAction}=await import('./comic-project-contract');expect(validateComicAction({action:'comic.generation.start',mode:'initial',panelIds:[],expectedRevision:'r'}).action).toBe('comic.generation.start');});
it('accepts comic regeneration action using selected software panel IDs',async()=>{const {validateComicAction}=await import('./comic-project-contract');expect(validateComicAction({action:'comic.generation.start',mode:'regenerate',panelIds:['panel'],expectedRevision:'r'}).effect).toBe('write');});
