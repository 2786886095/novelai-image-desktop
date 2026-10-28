import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import syncFs from 'node:fs';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(name:string)=>path.join(fixture.root,name),isPackaged:false,getVersion:()=> 'fixture'},dialog:{},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:async()=>({collections:{random:[],'v5-repair':[],'artist-string-draw':[]}})}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]})}));
import {defaultSettings,getSettings,writeStore} from './store';
import {importDataBackup,inspectDataBackupFile} from './data-backup';
// Data written by 2.6.x builds that still shipped the Studio Agent, the local Agent component, local ComfyUI and the in-app updater.
const removedConfiguration={updateSource:'gitee',harnessAutoUpdatePlugins:true,agentPromptTemplateMode:'custom',agentUiPreferences:{panel:'wide'}};
const removedApi={agentApiProtocol:'openai-compatible',agentApiBaseUrl:'https://agent.example.invalid/v1',agentApiKey:'legacy-agent-key',agentApiModel:'legacy-agent-model',savedAgentModels:['legacy-agent-model'],agentReasoningEffort:'high'};
const sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
async function legacyArchive(){
 const profile=Buffer.from('LEGACY TAVERN PROFILE'),capsuleZip=new JSZip();capsuleZip.file('files/profiles/custom.yml',profile);capsuleZip.file('manifest.json',JSON.stringify({version:1,kind:'agent',files:[{name:'profiles/custom.yml',bytes:profile.length,hash:sha(profile)}],omitted:[]}));
 const capsule=await capsuleZip.generateAsync({type:'nodebuffer'}),zip=new JSZip();
 zip.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,source:{platform:'win32',appVersion:'2.6.5'},categories:['configuration','apiCredentials','agentWorkspace','tavernAgent','workspaceData'].map(category=>({category,items:1,bytes:0}))}));
 zip.file('data/configuration.json',JSON.stringify({theme:'dark',language:'ja-JP',proxyForUpdate:false,...removedConfiguration}));
 zip.file('data/api-credentials.json',JSON.stringify({token:'',settings:{convertApiModel:'kept-convert-model',convertApiKey:'kept-convert-key',...removedApi}}));
 zip.file('data/agent-workspace.json',JSON.stringify({conversations:[{id:'legacy',messages:[],draftAttachments:[]}],characters:[],personas:[],lorebooks:[],samplerPresets:[]}));
 zip.file(`portable-projects/agent-${sha(capsule)}.zip`,capsule);
 zip.file('data/workspace.json',JSON.stringify({'langbai.artist-detective.v1':'{"prompt":"kept"}','langbai.comfy-studio.workspace-drafts.v1':'[]'}));
 const file=path.join(fixture.root,'legacy-2.6.5.naisbackup');await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer'}));return file;
}
const userData=()=>path.join(fixture.root,'userData');
beforeAll(async()=>{fixture.root=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-backup-restore-'));});
beforeEach(async()=>{await fs.mkdir(path.join(fixture.root,'images'),{recursive:true});writeStore({settings:{...defaultSettings(),outputDir:path.join(fixture.root,'images'),backupDir:path.join(fixture.root,'backups')},history:[],historyGroups:[],convertHistory:[],reverseHistory:[]});});
afterAll(async()=>{if(path.dirname(fixture.root)!==os.tmpdir()||!path.basename(fixture.root).startsWith('legacy-backup-restore-'))throw Error('Unexpected fixture');await fs.rm(fixture.root,{recursive:true,force:true});});
it('offers only the kept categories of an archive that still carries removed Agent, Harness, ComfyUI and updater data',async()=>{
 const inspected=await inspectDataBackupFile(await legacyArchive());
 expect(inspected.ok,inspected.message).toBe(true);expect(inspected.categories.map(item=>item.category)).toEqual(['configuration','apiCredentials','workspaceData']);
});
it('restores kept settings and workspace data while dropping removed settings, the Agent key and Agent capsules',async()=>{
 const result=await importDataBackup({path:await legacyArchive(),categories:['configuration','apiCredentials','agentWorkspace','tavernAgent','workspaceData'] as any,currentWorkspaceData:{},confirmConfigurationOverwrite:true});
 expect(result.ok,result.message).toBe(true);expect(result.recoveryPaths).toEqual([]);
 const settings=getSettings() as unknown as Record<string,unknown>;
 // The archive's UI language came from an older multi-language build; the UI is Chinese-only now.
 expect(settings).toMatchObject({theme:'dark',language:'zh-CN',proxyForUpdate:false,convertApiModel:'kept-convert-model',convertApiKey:'kept-convert-key'});
 for(const key of [...Object.keys(removedConfiguration),...Object.keys(removedApi)])expect(settings,key).not.toHaveProperty(key);
 const disk=syncFs.readFileSync(path.join(userData(),'novelai-image-desktop.json'),'utf8');
 for(const key of [...Object.keys(removedConfiguration),...Object.keys(removedApi)])expect(disk,key).not.toContain(`"${key}"`);
 expect(disk).not.toContain('legacy-agent-key');expect(disk).not.toContain('kept-convert-key');
 // Renderer drafts of removed tools are returned for the inert langbai.* merge, like any other workspace key.
 expect(result.workspaceData).toEqual({'langbai.artist-detective.v1':'{"prompt":"kept"}','langbai.comfy-studio.workspace-drafts.v1':'[]'});
 await expect(fs.stat(path.join(userData(),'TavernAgent'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(fs.stat(path.join(userData(),'portable-project-capsules'))).rejects.toMatchObject({code:'ENOENT'});
});
