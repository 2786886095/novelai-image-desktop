import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:'',store:{settings:{},history:[],historyGroups:[],reverseHistory:[],convertHistory:[]} as any}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root,getVersion:()=> 'test'},dialog:{showOpenDialog:vi.fn()}}));
vi.mock('./store',()=>({defaultSettings:{},readStore:()=>fixture.store,writeStore:(value:unknown)=>{fixture.store=value;},ensureOutputDir:()=>fixture.root}));
vi.mock('./local-media',()=>({imageFileUrl:(p:string)=>p}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>({conversations:[],characters:[],personas:[],lorebooks:[],samplerPresets:[]}),agentAttachmentsDirectory:()=>fixture.root,mergeImportedAgentWorkspace:vi.fn(()=>({imported:0,skipped:0,renamed:0}))}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:vi.fn(async()=>({collections:{}})),importArtistFavoriteLibrary:vi.fn()}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]}),importReferencePresets:vi.fn()}));
import {ARTIST_FAVORITE_COLLECTIONS} from './artist-favorites';
import {exportDataBackup,importDataBackup,inspectDataBackup} from './data-backup';
it('exports and restores native capsules through the public backup API',async()=>{
 const home=path.join(fixture.root,'TavernAgent/user-home/profiles');await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'synthetic.json'),'{"synthetic":true}');
 const exported=await exportDataBackup({categories:['tavernAgent','styleLab'],destination:'internal'});expect(exported.ok,exported.message).toBe(true);
 const zip=await JSZip.loadAsync(await fs.readFile(exported.path!));expect(Object.keys(zip.files).filter(n=>n.endsWith('.zip'))).toHaveLength(1);
 const imported=await importDataBackup({path:exported.path!,categories:['tavernAgent','styleLab'],confirmConfigurationOverwrite:true});expect(imported.ok,imported.message).toBe(true);expect(imported.recoveryPaths).toHaveLength(1);expect(await fs.readFile(path.join(home,'synthetic.json'),'utf8')).toBe('{"synthetic":true}');
 const interop=process.env.STUDIO_PORTABLE_INTEROP;
 if(interop){await fs.mkdir(interop,{recursive:true});await fs.copyFile(exported.path!,path.join(interop,'desktop.naisbackup'));
   const returned=path.join(interop,'mobile.naisbackup');try{await fs.access(returned);}catch{return;}
   const roundtrip=await importDataBackup({path:returned,categories:['tavernAgent','styleLab'],confirmConfigurationOverwrite:true});expect(roundtrip.ok,roundtrip.message).toBe(true);expect(roundtrip.recoveryPaths?.length).toBeGreaterThan(0);
   const again=await exportDataBackup({categories:['tavernAgent','styleLab'],destination:'internal'});const output=await JSZip.loadAsync(await fs.readFile(again.path!));const name=Object.keys(zip.files).find(n=>n.endsWith('.zip'))!;expect(await output.file(name)!.async('nodebuffer')).toEqual(await zip.file(name)!.async('nodebuffer'));
 }
});
beforeEach(async()=>{fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-portable-test-'));fixture.store={settings:{},history:[],historyGroups:[],reverseHistory:[],convertHistory:[]};const lib=await import('./artist-favorites');vi.mocked(lib.loadArtistFavoriteLibrary).mockResolvedValue({collections:Object.fromEntries(ARTIST_FAVORITE_COLLECTIONS.map(k=>[k,[]]))} as any);});
afterEach(async()=>{if(path.dirname(fixture.root)!==os.tmpdir()||!path.basename(fixture.root).startsWith('studio-portable-test-'))throw Error('invalid cleanup');await fs.rm(fixture.root,{recursive:true,force:true});});
it('round trips mobile-only preferences and desktop drafts through a real archive without overwriting current preferences',async()=>{
 const input=new JSZip();input.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[{category:'workspaceData',items:2,bytes:0}]}));input.file('data/mobile-state.json',JSON.stringify({'mobile-only-project':'keep','existing':'incoming'}));input.file('data/workspace.json',JSON.stringify({'langbai.artist-detective.v1':'{"prompt":"test"}'}));const file=path.join(fixture.root,'incoming.naisbackup');await fs.writeFile(file,await input.generateAsync({type:'nodebuffer'}));await fs.writeFile(path.join(fixture.root,'backup-mobile-state.json'),JSON.stringify({existing:'current'}));
 const result=await importDataBackup({path:file,categories:['workspaceData'],currentWorkspaceData:{},confirmConfigurationOverwrite:false});expect(result.ok,result.message).toBe(true);expect(result.workspaceData).toEqual({'langbai.artist-detective.v1':'{"prompt":"test"}'});
 const output=await exportDataBackup({categories:['workspaceData'],destination:'internal',workspaceData:result.workspaceData});expect(output.ok,output.message).toBe(true);const zip=await JSZip.loadAsync(await fs.readFile(output.path!));expect(JSON.parse(await zip.file('data/mobile-state.json')!.async('string'))).toEqual({'mobile-only-project':'keep',existing:'current'});expect(JSON.parse(await zip.file('data/workspace.json')!.async('string'))).toEqual(result.workspaceData);expect(fixture.store.settings).toEqual({});
});
it('old archives lacking mobile-state remain importable',async()=>{const input=new JSZip();input.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[]}));input.file('data/workspace.json','{}');const file=path.join(fixture.root,'old.naisbackup');await fs.writeFile(file,await input.generateAsync({type:'nodebuffer'}));const result=await importDataBackup({path:file,categories:['workspaceData'],confirmConfigurationOverwrite:false});expect(result.ok,result.message).toBe(true);await expect(fs.stat(path.join(fixture.root,'backup-mobile-state.json'))).rejects.toMatchObject({code:'ENOENT'});});

it('inspection lifts native data from an old manifest into independent categories with real counts',async()=>{
 const home=path.join(fixture.root,'TavernAgent/user-home/profiles');await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'synthetic.json'),'{}');
 const exported=await exportDataBackup({categories:['tavernAgent'],destination:'internal'});
 expect(exported.categories).toEqual([{category:'tavernAgent',items:1,bytes:2}]);
 const zip=await JSZip.loadAsync(await fs.readFile(exported.path!));
 const manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));
 manifest.categories=[{category:'agentWorkspace',items:0,bytes:0},{category:'apiCredentials',items:0,bytes:0}];
 zip.file('manifest.json',JSON.stringify(manifest));await fs.writeFile(exported.path!,await zip.generateAsync({type:'nodebuffer'}));
 const {dialog}=await import('electron');vi.mocked(dialog.showOpenDialog).mockResolvedValue({canceled:false,filePaths:[exported.path!]} as any);
 const inspected=await inspectDataBackup();expect(inspected.ok,inspected.message).toBe(true);
 expect(inspected.categories).toContainEqual({category:'tavernAgent',items:1,bytes:2});
 const restored=await importDataBackup({path:exported.path!,categories:['tavernAgent'],confirmConfigurationOverwrite:false});
 expect(restored.ok,restored.message).toBe(true);expect(restored.recoveries?.[0].status).toBe('staged');
});
