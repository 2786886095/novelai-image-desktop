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

const caption = (prompt='blue coat') => ({enabled:false,name:'Neutral character',prompt,negativePrompt:'red coat',useCoords:true,x:0,y:1});
const preset = (captions:any[]= [caption()]) => ({id:'same-source',name:'Neutral preset',prompt:'blue square',createdAt:'2026-10-11T00:00:00Z',captions});
async function restore(rows:any[]) {
 const zip=new JSZip();zip.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[{category:'promptPresets',items:rows.length,bytes:0}]}));zip.file('data/prompt-presets.json',JSON.stringify({positivePromptPresets:rows}));
 const target=path.join(fixture.root,'input.naisbackup');await fs.writeFile(target,await zip.generateAsync({type:'nodebuffer'}));const report=await importDataBackup({path:target,categories:['promptPresets'],confirmConfigurationOverwrite:false});expect(report.ok,report.message).toBe(true);
}
it('backup restores named disabled characters, negative prompts and edge coordinates',async()=>{await restore([preset()]);expect(fixture.store.settings.positivePromptPresets[0].captions).toEqual([caption()]);});
it('same source ID, name and base prompt with different characters remain distinct and re-import idempotently',async()=>{const rows=[preset(),preset([caption('green coat')])];await restore(rows);expect(fixture.store.settings.positivePromptPresets).toHaveLength(2);expect(new Set(fixture.store.settings.positivePromptPresets.map((v:any)=>v.id)).size).toBe(2);await restore(rows);expect(fixture.store.settings.positivePromptPresets).toHaveLength(2);expect(fixture.store.settings.positivePromptPresets.map((v:any)=>v.captions[0].prompt)).toEqual(['blue coat','green coat']);});
it('legacy presets without characters and reordered caption fields do not duplicate',async()=>{await restore([{...preset(),captions:undefined},preset()]);expect(fixture.store.settings.positivePromptPresets).toHaveLength(2);await restore([{...preset(),captions:[]},preset([Object.fromEntries(Object.entries(caption()).reverse())])]);expect(fixture.store.settings.positivePromptPresets).toHaveLength(2);});
it('normalizes untrusted backup captions without importing transient IDs',async()=>{await restore([preset([{...caption(),id:'transient',x:-3,y:4},null,3])]);expect(fixture.store.settings.positivePromptPresets[0].captions).toEqual([{...caption(),x:0,y:1}]);});
it('absent source IDs still re-import idempotently after a name collision',async()=>{const rows=[{...preset(),id:undefined},{...preset([caption('green coat')]),id:undefined}];await restore(rows);await restore(rows);expect(fixture.store.settings.positivePromptPresets).toHaveLength(2);});
it('restores saved-prompt tags and merges them into matching existing entries',async()=>{
 const payload=(tags:string[])=>({positivePromptPresets:[{...preset([]),tags}],promptChunks:[{id:'chunk',name:'Outfit',content:'white dress',tags,createdAt:'x',updatedAt:'y'}]});
 async function restorePayload(data:unknown){const zip=new JSZip();zip.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[{category:'promptPresets',items:2,bytes:0}]}));zip.file('data/prompt-presets.json',JSON.stringify(data));const target=path.join(fixture.root,'tags.naisbackup');await fs.writeFile(target,await zip.generateAsync({type:'nodebuffer'}));const report=await importDataBackup({path:target,categories:['promptPresets'],confirmConfigurationOverwrite:false});expect(report.ok,report.message).toBe(true);}
 await restorePayload(payload([' 夜景 ','#夜景']));
 expect(fixture.store.settings.positivePromptPresets.map((v:any)=>v.tags)).toEqual([['夜景']]);
 expect(fixture.store.settings.promptChunks.map((v:any)=>v.tags)).toEqual([['夜景']]);
 await restorePayload(payload(['城市']));
 expect(fixture.store.settings.positivePromptPresets).toHaveLength(1);
 expect(fixture.store.settings.positivePromptPresets[0].tags).toEqual(['夜景','城市']);
 expect(fixture.store.settings.promptChunks).toHaveLength(1);
 expect(fixture.store.settings.promptChunks[0].tags).toEqual(['夜景','城市']);
 await restorePayload({positivePromptPresets:[{...preset([]),id:'untagged',name:'Untagged',prompt:'plain'}]});
 expect(Object.keys(fixture.store.settings.positivePromptPresets[1])).not.toContain('tags');
});
