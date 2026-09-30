import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import syncFs from 'node:fs';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(name:string)=>path.join(fixture.root,name),isPackaged:false,getVersion:()=> 'fixture'},dialog:{},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>({conversations:[],characters:[],personas:[],lorebooks:[],samplerPresets:[]}),agentAttachmentsDirectory:()=>path.join(fixture.root,'attachments'),mergeImportedAgentWorkspace:vi.fn(()=>({imported:0,skipped:0,renamed:0}))}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:async()=>({collections:{random:[],'v5-repair':[],'artist-string-draw':[]}})}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]})}));
import {defaultSettings,writeStore,readStore,getSettings,setCompatibleImageSettings,setSetting,setToken,getToken,clearToken} from './store';
import {exportDataBackup,importDataBackup} from './data-backup';
import {exportImageSettings,readImageSettingsBackup} from '../../src/compatible-image-backup';
import {generateConfiguredImages} from './compatible-generation';
const config={baseUrl:'https://images.example.test/v1',model:'fixture-backup',size:'auto',responseFormat:'auto' as const,extensions:{steps:28,scale:5.5,negative_prompt:'noise'}};
const profile=(key='fixture-image-key',provider:'novelai'|'openai-images'='openai-images')=>({imageProvider:provider,compatibleImage:config,imageApiKey:key});
beforeAll(async()=>{fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'compatible-backup-'));});
beforeEach(async()=>{await fs.mkdir(path.join(fixture.root,'images'),{recursive:true});writeStore({settings:{...defaultSettings(),outputDir:path.join(fixture.root,'images'),backupDir:path.join(fixture.root,'backups'),...profile()},history:[],historyGroups:[],convertHistory:[],reverseHistory:[]});});
afterAll(async()=>{if(path.dirname(fixture.root)!==os.tmpdir()||!path.basename(fixture.root).startsWith('compatible-backup-'))throw Error('Unexpected fixture');await fs.rm(fixture.root,{recursive:true,force:true});});
async function archive(api:Record<string,unknown>,configuration?:Record<string,unknown>){const zip=new JSZip();zip.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:[]}));zip.file('data/api-credentials.json',JSON.stringify({settings:api}));if(configuration)zip.file('data/configuration.json',JSON.stringify(configuration));const file=path.join(fixture.root,'input.naisbackup');await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer'}));return file;}
async function restore(file:string,categories:any=['apiCredentials']){return importDataBackup({path:file,categories,confirmConfigurationOverwrite:true});}
async function exported(){const result=await exportDataBackup({categories:['apiCredentials','configuration'],destination:'internal'});expect(result.ok,result.message).toBe(true);const zip=await JSZip.loadAsync(await fs.readFile(result.path!));return{file:result.path!,api:JSON.parse(await zip.file('data/api-credentials.json')!.async('string')).settings,configuration:JSON.parse(await zip.file('data/configuration.json')!.async('string'))};}
it('archives a cleared legacy key without reactivating the retired provider',async()=>{
 const result=await restore(await archive({...profile(''),compatibleImage:{...config,model:'cleared'}}));expect(result.ok,result.message).toBe(true);
 expect(getSettings()).toMatchObject({imageProvider:'novelai',imageApiKey:'',compatibleImage:{model:'cleared'}});
 const generation=await generateConfiguredImages({prompt:'not submitted',n:1});expect(generation.ok).toBe(false);expect(generation.items).toEqual([]);
});
it('normalizes Android credential pointers and keeps keys out of ordinary configuration',async()=>{
 const input={...profile(),compatibleImage:{...config,credentialId:'123-device',imageApiKey:'nested-not-an-input'}};
 const result=await restore(await archive(input));expect(result.ok,result.message).toBe(true);
 expect(getSettings().compatibleImage).toEqual(config);const output=await exported();expect(output.api).toMatchObject(profile('fixture-image-key','novelai'));
 expect(JSON.stringify(output.configuration)).not.toMatch(/imageApiKey|compatibleImage|imageProvider|imageServiceRevision|imageServiceVersion|fixture-image-key/);
 expect(JSON.stringify(output.api)).not.toMatch(/credentialId|nested-not-an-input|imageServiceRevision/);
 const disk=await fs.readFile(path.join(fixture.root,'userData','novelai-image-desktop.json'),'utf8');expect(disk).not.toContain('fixture-image-key');
});
it('round trips native-disabled and never-configured profiles including an empty key',async()=>{
 for(const input of [profile('','novelai'),{imageProvider:'novelai',compatibleImage:{},imageApiKey:''}]){
  expect((await restore(await archive(input))).ok).toBe(true);expect((await exported()).api).toMatchObject(readImageSettingsBackup(input)!);
 }
});
it('rejects incomplete endpoint/key tuples before any overwrite',async()=>{
 for(const input of [{imageProvider:'openai-images',compatibleImage:config},{imageApiKey:'new'},{compatibleImage:config},{...profile(),imageApiKey:42},{...profile(),imageProvider:['novelai']}]){
  const before=getSettings();expect((await restore(await archive(input))).ok).toBe(false);expect(getSettings()).toEqual(before);
 }
});
it('rejects malformed address, dimensions, format and extension values without printing a secret',()=>{
 for(const patch of [{baseUrl:'https://user:pass@host/v1'},{size:'bad'},{responseFormat:'invalid'},{extensions:{Authorization:'secret'}},{model:12}]){
  expect(()=>readImageSettingsBackup({...profile('private-fixture'),compatibleImage:{...config,...patch}})).toThrow();
 }
 expect(readImageSettingsBackup({visionApiKey:'old-archive'})).toBeNull();
});
it('keeps current image credentials when importing legacy API archives and configuration-only archives',async()=>{
 const before=exportImageSettings(getSettings());expect((await restore(await archive({visionApiModel:'legacy-model'}))).ok).toBe(true);
 expect(exportImageSettings(getSettings())).toEqual(before);
 expect((await restore(await archive({}, {theme:'dark',...profile('injected')}),['configuration'])).ok).toBe(true);
 expect(exportImageSettings(getSettings())).toEqual(before);expect(getSettings().theme).toBe('dark');
});
it('detects an image service change during asynchronous restoration, while unrelated imports preserve it',async()=>{
 const input=await archive(profile('incoming'));
 const original=fs.readFile.bind(fs);let changed=false;
 const spy=vi.spyOn(fs,'readFile').mockImplementation((async(...args:any[])=>{
  const result=await (original as Function)(...args);
  if(!changed&&String(args[0])===input){changed=true;setCompatibleImageSettings({...config,model:'newer-agent'},'newer-private-key','novelai');}
  return result;
 }) as typeof fs.readFile);
 try{const result=await restore(input);expect(result.ok).toBe(false);expect(result.message).toContain('配置已变化');expect(getSettings().imageApiKey).toBe('newer-private-key');}finally{spy.mockRestore();}
});
it('public ZIP interchange exports desktop states and imports actual Android round-trip archives when requested',async()=>{
 const directory=process.env.STUDIO_IMAGE_BACKUP_INTEROP;if(!directory)return;
 await fs.mkdir(directory,{recursive:true});
 for(const [name,api] of Object.entries({configured:profile(),cleared:profile(''),disabled:profile('fixture-disabled','novelai'),empty:{imageProvider:'novelai' as const,compatibleImage:{},imageApiKey:''}})){
  expect((await restore(await archive(api))).ok).toBe(true);const file=await exported();await fs.copyFile(file.file,path.join(directory,`desktop-${name}.naisbackup`));
  if(process.env.STUDIO_IMAGE_BACKUP_STAGE==='return'){
   const returned=path.join(directory,`mobile-${name}.naisbackup`);expect((await restore(returned)).ok).toBe(true);
   expect(exportImageSettings(getSettings())).toEqual(readImageSettingsBackup(api));
  }
 }
});

it('labels an unavailable source key instead of silently treating it as an explicit empty key',()=>{
 const unavailable=exportImageSettings({...profile(''),credentialIssues:['imageApiKey']});
 expect(unavailable.imageCredentialState).toBe('unavailable');expect(()=>readImageSettingsBackup(unavailable)).toThrow('未解锁');
});

it('failed explicit token replacement and clearing keep the previous cached credential',()=>{
 setToken('fixture-original-token');const spy=vi.spyOn(syncFs,'writeFileSync').mockImplementation(()=>{throw Error('fixture write failure');});
 try{expect(()=>setToken('fixture-new-token')).toThrow();expect(getToken()).toBe('fixture-original-token');expect(()=>clearToken()).toThrow();expect(getToken()).toBe('fixture-original-token');}finally{spy.mockRestore();}
});
