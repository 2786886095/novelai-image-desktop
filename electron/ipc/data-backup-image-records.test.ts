import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:'',store:{settings:{},history:[],historyGroups:[],reverseHistory:[],convertHistory:[]} as any}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root,getVersion:()=> 'test'},dialog:{showOpenDialog:vi.fn()}}));
vi.mock('./store',()=>({credentialIssues:()=>[],defaultSettings:{},readStore:()=>fixture.store,writeStore:(value:unknown)=>{fixture.store=value;},ensureOutputDir:()=>fixture.root}));
vi.mock('./local-media',()=>({imageFileUrl:(p:string)=>p}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>({conversations:[],characters:[],personas:[],lorebooks:[],samplerPresets:[]}),agentAttachmentsDirectory:()=>fixture.root,mergeImportedAgentWorkspace:vi.fn(()=>({imported:0,skipped:0,renamed:0}))}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:vi.fn(async()=>({collections:{}})),importArtistFavoriteLibrary:vi.fn()}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]}),importReferencePresets:vi.fn()}));
import {ARTIST_FAVORITE_COLLECTIONS} from './artist-favorites';
import {exportDataBackup,importDataBackup,inspectDataBackup} from './data-backup';
beforeEach(async()=>{fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-portable-test-'));fixture.store={settings:{outputDir:fixture.root},history:[],historyGroups:[],reverseHistory:[],convertHistory:[]};const lib=await import('./artist-favorites');vi.mocked(lib.loadArtistFavoriteLibrary).mockResolvedValue({collections:Object.fromEntries(ARTIST_FAVORITE_COLLECTIONS.map(k=>[k,[]]))} as any);});
afterEach(async()=>{if(path.dirname(fixture.root)!==os.tmpdir()||!path.basename(fixture.root).startsWith('studio-portable-test-'))throw Error('invalid cleanup');await fs.rm(fixture.root,{recursive:true,force:true});});

const capsule=process.env.NATIVE_IMAGE_RECORDS_BACKUP ?? path.resolve('mobile/test/fixtures/native_image_records.naisbackup');
async function input(change?:(data:any)=>void){
 const zip=await JSZip.loadAsync(await fs.readFile(capsule));
 const data=JSON.parse(await zip.file('data/image-history.json')!.async('string'));
 change?.(data);zip.file('data/image-history.json',JSON.stringify(data));
 const target=path.join(fixture.root,'fixed-input.naisbackup');
 await fs.writeFile(target,await zip.generateAsync({type:'nodebuffer'}));return {target,data};
}
async function restore(target:string){const report=await importDataBackup({path:target,categories:['imageHistory'],confirmConfigurationOverwrite:false});expect(report.ok,report.message).toBe(true);return report;}
function shape(v:any){return Object.fromEntries(['date','createdAt','actualSeed','model','width','height','feature','params','groupId'].map(k=>[k,v[k]]));}
it('restores both complete native exported generation records and repeats without duplicating',async()=>{
 const {target,data}=await input();await restore(target);
 const ordered=(items:any[])=>items.map(shape).sort((a,b)=>Number(a.actualSeed)-Number(b.actualSeed));expect(ordered(fixture.store.history)).toEqual(ordered(data.items));
 expect(new Set(fixture.store.history.map((v:any)=>v.filePath)).size).toBe(2);
 for(const row of fixture.store.history)expect(await fs.readFile(row.filePath)).toEqual(await (await JSZip.loadAsync(await fs.readFile(capsule))).file(data.items[0].asset.asset)!.async('nodebuffer'));
 await restore(target);expect(fixture.store.history).toHaveLength(2);
});
it('same asset and identical metadata with a new source ID remain one record',async()=>{
 const {target}=await input(d=>{d.items[1]={...d.items[0],id:'other-id'};});await restore(target);expect(fixture.store.history).toHaveLength(1);await restore(target);expect(fixture.store.history).toHaveLength(1);
});
it('same source ID and pixels with changed metadata preserve two unique local IDs',async()=>{
 const {target}=await input(d=>{d.items[1].id=d.items[0].id;});await restore(target);expect(fixture.store.history).toHaveLength(2);expect(new Set(fixture.store.history.map((v:any)=>v.id)).size).toBe(2);await restore(target);expect(fixture.store.history).toHaveLength(2);
});
it('a changed actual seed alone is a distinct record',async()=>{
 const {target}=await input(d=>{d.items[1]={...d.items[0],id:'seed-only',actualSeed:17,seed:17};});await restore(target);expect(fixture.store.history.map((v:any)=>v.actualSeed)).toEqual([7,17]);
});
it('parameter key ordering and remapped group IDs do not defeat de-duplication',async()=>{
 const {target,data}=await input(d=>{d.items=d.items.slice(0,1);});await restore(target);fixture.store.historyGroups[0].id='local-group';fixture.store.history[0].groupId='local-group';fixture.store.history[0].params=Object.fromEntries(Object.entries(data.items[0].params).reverse());await restore(target);expect(fixture.store.history).toHaveLength(1);
});
it('legacy omitted timestamps remain repeat-importable without duplicates',async()=>{
 const {target}=await input(d=>{d.items=d.items.slice(0,1);delete d.items[0].createdAt;delete d.items[0].date;});await restore(target);await restore(target);expect(fixture.store.history).toHaveLength(1);
});
