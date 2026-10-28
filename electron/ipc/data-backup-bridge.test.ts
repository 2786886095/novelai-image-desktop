import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:'',store:{settings:{},history:[],historyGroups:[],reverseHistory:[],convertHistory:[]} as any}));
vi.mock('electron',()=>({app:{getPath:()=>fixture.root,getVersion:()=> 'test'},dialog:{showOpenDialog:vi.fn(),showSaveDialog:vi.fn()}}));
vi.mock('./store',()=>({credentialIssues:()=>[],defaultSettings:{},readStore:()=>fixture.store,writeStore:(value:unknown)=>{fixture.store=value;},ensureOutputDir:()=>fixture.root}));
vi.mock('./local-media',()=>({imageFileUrl:(p:string)=>p}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:vi.fn(async()=>({collections:{}})),importArtistFavoriteLibrary:vi.fn()}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]}),importReferencePresets:vi.fn()}));
import {ARTIST_FAVORITE_COLLECTIONS} from './artist-favorites';
import {exportDataBackup,importDataBackup,inspectDataBackup} from './data-backup';
import {PORTABLE_ERRORS,registerPortableBusy} from './portable-projects';
// Synthetic Artist Detective result bound as the current local run.
async function detectiveRun(image='synthetic image'){const run=path.join(fixture.root,'detective-run');await fs.mkdir(run,{recursive:true});await fs.writeFile(path.join(run,'result.png'),image);const config=path.join(fixture.root,'artist-detective-runtime.json');await fs.writeFile(config,JSON.stringify({directory:run}));return {run,config};}
it('exports and restores native capsules through the public backup API',async()=>{
 const {run,config}=await detectiveRun();const binding=await fs.readFile(config,'utf8');
 const exported=await exportDataBackup({categories:['styleLab'],destination:'internal'});expect(exported.ok,exported.message).toBe(true);
 const zip=await JSZip.loadAsync(await fs.readFile(exported.path!));expect(Object.keys(zip.files).filter(n=>n.endsWith('.zip'))).toHaveLength(1);
 // A removed category requested by an older client is ignored, not an error.
 const imported=await importDataBackup({path:exported.path!,categories:['tavernAgent','styleLab'] as any,confirmConfigurationOverwrite:true});expect(imported.ok,imported.message).toBe(true);expect(imported.recoveryPaths).toHaveLength(1);expect(imported.recoveries?.[0].status).toBe('staged');
 expect(await fs.readFile(path.join(run,'result.png'),'utf8')).toBe('synthetic image');expect(await fs.readFile(config,'utf8')).toBe(binding);
 const interop=process.env.STUDIO_PORTABLE_INTEROP;
 if(interop){await fs.mkdir(interop,{recursive:true});await fs.copyFile(exported.path!,path.join(interop,'desktop.naisbackup'));
   const returned=path.join(interop,'mobile.naisbackup');try{await fs.access(returned);}catch{return;}
   const roundtrip=await importDataBackup({path:returned,categories:['styleLab'],confirmConfigurationOverwrite:true});expect(roundtrip.ok,roundtrip.message).toBe(true);expect(roundtrip.recoveryPaths?.length).toBeGreaterThan(0);
   const again=await exportDataBackup({categories:['styleLab'],destination:'internal'});const output=await JSZip.loadAsync(await fs.readFile(again.path!));const name=Object.keys(zip.files).find(n=>n.endsWith('.zip'))!;expect(await output.file(name)!.async('nodebuffer')).toEqual(await zip.file(name)!.async('nodebuffer'));
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
 await detectiveRun('png');
 const exported=await exportDataBackup({categories:['styleLab'],destination:'internal'});
 expect(exported.categories).toEqual([{category:'styleLab',items:1,bytes:3}]);
 const zip=await JSZip.loadAsync(await fs.readFile(exported.path!));
 const manifest=JSON.parse(await zip.file('manifest.json')!.async('string'));
 manifest.categories=[{category:'agentWorkspace',items:0,bytes:0},{category:'tavernAgent',items:4,bytes:9},{category:'apiCredentials',items:0,bytes:0}];
 zip.file('manifest.json',JSON.stringify(manifest));await fs.writeFile(exported.path!,await zip.generateAsync({type:'nodebuffer'}));
 const {dialog}=await import('electron');vi.mocked(dialog.showOpenDialog).mockResolvedValue({canceled:false,filePaths:[exported.path!]} as any);
 const inspected=await inspectDataBackup();expect(inspected.ok,inspected.message).toBe(true);
 expect(inspected.categories).toContainEqual({category:'styleLab',items:1,bytes:3});
 expect(inspected.categories?.map(item=>item.category)).not.toEqual(expect.arrayContaining(['agentWorkspace']));expect(inspected.categories?.map(item=>item.category)).not.toEqual(expect.arrayContaining(['tavernAgent']));
 const restored=await importDataBackup({path:exported.path!,categories:['styleLab'],confirmConfigurationOverwrite:false});
 expect(restored.ok,restored.message).toBe(true);expect(restored.recoveries?.[0].status).toBe('staged');
});
it('old archives carrying removed Agent workspace data and component capsules still restore the kept categories',async()=>{
 const sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
 const profile=Buffer.from('LEGACY AGENT PROFILE'),legacy=new JSZip();legacy.file('files/profiles/custom.yml',profile);legacy.file('manifest.json',JSON.stringify({version:1,kind:'agent',files:[{name:'profiles/custom.yml',bytes:profile.length,hash:sha(profile)}],omitted:[]}));const capsule=await legacy.generateAsync({type:'nodebuffer'});
 const input=new JSZip();input.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[{category:'agentWorkspace',items:1,bytes:0},{category:'tavernAgent',items:1,bytes:profile.length},{category:'workspaceData',items:1,bytes:0}]}));
 input.file('data/agent-workspace.json',JSON.stringify({conversations:[{id:'legacy',messages:[],draftAttachments:[]}],characters:[],personas:[],lorebooks:[],samplerPresets:[]}));
 input.file(`portable-projects/agent-${sha(capsule)}.zip`,capsule);input.file('data/workspace.json',JSON.stringify({'langbai.artist-detective.v1':'{"prompt":"kept"}'}));
 const file=path.join(fixture.root,'legacy.naisbackup');await fs.writeFile(file,await input.generateAsync({type:'nodebuffer'}));
 const {dialog}=await import('electron');vi.mocked(dialog.showOpenDialog).mockResolvedValue({canceled:false,filePaths:[file]} as any);
 const inspected=await inspectDataBackup();expect(inspected.ok,inspected.message).toBe(true);expect(inspected.categories?.map(item=>item.category)).toEqual(['workspaceData']);
 expect((await importDataBackup({path:file,categories:['agentWorkspace','tavernAgent'] as any,confirmConfigurationOverwrite:false})).ok).toBe(false);
 const result=await importDataBackup({path:file,categories:['agentWorkspace','tavernAgent','workspaceData'] as any,currentWorkspaceData:{},confirmConfigurationOverwrite:false});
 expect(result.ok,result.message).toBe(true);expect(result.workspaceData).toEqual({'langbai.artist-detective.v1':'{"prompt":"kept"}'});expect(result.recoveryPaths??[]).toEqual([]);
 await expect(fs.stat(path.join(fixture.root,'TavernAgent'))).rejects.toMatchObject({code:'ENOENT'});await expect(fs.stat(path.join(fixture.root,'portable-project-capsules'))).rejects.toMatchObject({code:'ENOENT'});
});
it('reports a damaged style lab capsule and a running Artist Detective in Chinese',async()=>{
 await detectiveRun('png');
 const exported=await exportDataBackup({categories:['styleLab'],destination:'internal'});expect(exported.ok,exported.message).toBe(true);
 // A valid capsule whose bytes no longer match the hash in its name.
 const zip=await JSZip.loadAsync(await fs.readFile(exported.path!));const name=Object.keys(zip.files).find(n=>n.endsWith('.zip'))!;
 const inner=await JSZip.loadAsync(await zip.file(name)!.async('nodebuffer'));const manifest=JSON.parse(await inner.file('manifest.json')!.async('string'));
 manifest.omitted=['changed'];inner.file('manifest.json',JSON.stringify(manifest));zip.file(name,await inner.generateAsync({type:'nodebuffer'}));
 await fs.writeFile(exported.path!,await zip.generateAsync({type:'nodebuffer'}));
 const {dialog}=await import('electron');vi.mocked(dialog.showOpenDialog).mockResolvedValue({canceled:false,filePaths:[exported.path!]} as any);
 expect(await inspectDataBackup()).toMatchObject({ok:false,message:`无法读取备份：${PORTABLE_ERRORS.capsuleIntegrity}`});
 expect(await importDataBackup({path:exported.path!,categories:['styleLab'],confirmConfigurationOverwrite:false})).toMatchObject({ok:false,message:`无法读取备份：${PORTABLE_ERRORS.capsuleIntegrity}`});
 registerPortableBusy(()=>true);
 try{
  vi.mocked(dialog.showSaveDialog).mockResolvedValue({canceled:false,filePath:path.join(fixture.root,'busy.naisbackup')} as any);
  expect(await exportDataBackup({categories:['styleLab']})).toEqual({ok:false,message:`导出失败：${PORTABLE_ERRORS.detectiveRunning}`});
 }finally{registerPortableBusy(()=>false);}
});
