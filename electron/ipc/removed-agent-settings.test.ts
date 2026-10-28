import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:()=>fixture.root,getAppPath:()=>fixture.root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'removed-agent-settings-'));vi.resetModules();});
afterEach(()=>{if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('removed-agent-settings-'))throw Error('Invalid fixture');fs.rmSync(fixture.root,{recursive:true,force:true});});
// Settings persisted by versions that still shipped the Studio Agent, the local Agent component and the in-app updater.
const legacy={agentApiProtocol:'openai-compatible',agentApiBaseUrl:'https://agent.example.invalid/v1',agentApiKey:'enc:v1:'+Buffer.from('legacy-agent-key').toString('base64'),agentApiModel:'legacy-model',savedAgentModels:['legacy-model'],agentReasoningEffort:'high',agentProviderName:'Legacy',agentContextWindow:8192,agentMaxOutputTokens:256,agentUiPreferences:{},agentAutoCompact:true,agentAutoCompactThreshold:0.8,agentVisionEnabled:true,agentPromptTemplateMode:'custom',harnessAutoUpdatePlugins:true,updateSource:'gitee'};
const diskSettings=()=>JSON.parse(fs.readFileSync(path.join(fixture.root,'novelai-image-desktop.json'),'utf8')).settings;
it('drops persisted settings of the removed Agent and updater without reporting a locked key and never writes them back',async()=>{
 fs.writeFileSync(path.join(fixture.root,'novelai-image-desktop.json'),JSON.stringify({settings:{...legacy,convertApiModel:'kept-model'}}));
 const store=await import('./store');const settings=store.getSettings() as unknown as Record<string,unknown>;
 for(const key of Object.keys(legacy))expect(settings,key).not.toHaveProperty(key);
 expect(settings.convertApiModel).toBe('kept-model');expect(settings.credentialIssues).toEqual([]);
 store.setSetting('convertApiModel','next-model');
 const disk=diskSettings();for(const key of Object.keys(legacy))expect(disk,key).not.toHaveProperty(key);
 expect(disk.convertApiModel).toBe('next-model');
});
it('direct writes cannot persist the removed Agent and updater settings',async()=>{
 const store=await import('./store');const current=store.readStore();
 store.writeStore({...current,settings:{...current.settings,...legacy} as typeof current.settings});
 const disk=diskSettings();for(const key of Object.keys(legacy))expect(disk,key).not.toHaveProperty(key);
 for(const key of Object.keys(legacy))expect(store.readStore().settings,key).not.toHaveProperty(key);
});
