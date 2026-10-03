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

const mcpKeys=['tagServerTool','tagServerRelatedTool','tagServerArtistTool'] as const;
const mcpSaved={tagServerEnabled:true,tagServerUrl:'http://127.0.0.1:6350/mcp',tagServerType:'http',tagServerTool:'search_tags',tagServerRelatedTool:'get_related_tags',tagServerArtistTool:'get_artist_recommendations'};
const mcpLocal={tagServerTool:'local_search',tagServerRelatedTool:'local_related',tagServerArtistTool:'local_artist'};
const slots=(s:any)=>Object.fromEntries(mcpKeys.map(k=>[k,s[k]??'']));
function seedMcp(s:any){writeStore({...readStore(),settings:{...readStore().settings,...s}});}
it('MCP metadata 01 exports all three API tool slots',async()=>{seedMcp(mcpSaved);const out=await exported();expect(slots(out.api)).toEqual(slots(mcpSaved));});
it('MCP metadata 02 configuration-only export excludes API routing slots',async()=>{seedMcp(mcpSaved);const out=await exported();for(const k of mcpKeys)expect.soft(Object.hasOwn(out.configuration,k)).toBe(false);});
it('MCP metadata 03 API-only import restores all three slots and endpoint',async()=>{seedMcp(mcpLocal);expect((await restore(await archive(mcpSaved))).ok).toBe(true);expect(slots(readStore().settings)).toEqual(slots(mcpSaved));expect(readStore().settings.tagServerUrl).toBe(mcpSaved.tagServerUrl);});
it('MCP metadata 04 legacy API import preserves unspecified optional slots',async()=>{seedMcp(mcpLocal);expect((await restore(await archive({tagServerTool:'legacy_search'}))).ok).toBe(true);expect(slots(readStore().settings)).toEqual({...slots(mcpLocal),tagServerTool:'legacy_search'});});
it('MCP metadata 05 configuration-only import cannot overwrite API tool slots',async()=>{seedMcp(mcpLocal);expect((await restore(await archive({}, {theme:'dark',...mcpSaved}),['configuration'])).ok).toBe(true);expect(slots(readStore().settings)).toEqual(slots(mcpLocal));expect(readStore().settings.theme).toBe('dark');});
it('MCP metadata 06 combined configuration and API import follows the API category',async()=>{seedMcp(mcpLocal);expect((await restore(await archive(mcpSaved,{theme:'dark',tagServerTool:'config_search',tagServerRelatedTool:'config_related',tagServerArtistTool:'config_artist'}),['configuration','apiCredentials'])).ok).toBe(true);expect(slots(readStore().settings)).toEqual(slots(mcpSaved));});
it('MCP metadata 07 explicit empty optional slots really clear the selections',async()=>{seedMcp(mcpLocal);expect((await restore(await archive({...mcpSaved,tagServerRelatedTool:'',tagServerArtistTool:''}))).ok).toBe(true);expect(slots(readStore().settings)).toEqual({tagServerTool:mcpSaved.tagServerTool,tagServerRelatedTool:'',tagServerArtistTool:''});});
it('MCP metadata 08 rejected confirmation leaves store bytes unchanged',async()=>{seedMcp(mcpLocal);const input=await archive(mcpSaved);const file=path.join(fixture.root,'userData','novelai-image-desktop.json');const before=await fs.readFile(file);const out=await importDataBackup({path:input,categories:['apiCredentials'],confirmConfigurationOverwrite:false});expect(out.ok).toBe(false);expect(await fs.readFile(file)).toEqual(before);expect(slots(readStore().settings)).toEqual(slots(mcpLocal));});
