import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const fixture=vi.hoisted(()=>({root:'',handlers:new Map<string,Function>()}));
vi.mock('electron',()=>({ipcMain:{handle:(n:string,f:Function)=>fixture.handlers.set(n,f)},app:{isPackaged:false,getPath:()=>fixture.root,getAppPath:()=>fixture.root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'novelai-only-'));fixture.handlers.clear();vi.resetModules();});
afterEach(()=>{vi.restoreAllMocks();if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('novelai-only-'))throw Error('Invalid fixture');fs.rmSync(fixture.root,{recursive:true,force:true});});
it('migrates a retired provider without copying credentials or changing NovelAI endpoints and retry consent',async()=>{
 fs.writeFileSync(path.join(fixture.root,'novelai-image-desktop.json'),JSON.stringify({token:'fixture-native-token',settings:{imageProvider:'openai-images',imageApiKey:'fixture-old-key',compatibleImage:{baseUrl:'https://old.example/v1',model:'old'},apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://relay.example',allowCustomEndpoint:true,allowCustomEndpointFallback:false}}));
 const {getSettings,getToken}=await import('./store');const s=getSettings();expect(s).toMatchObject({imageProvider:'novelai',imageApiKey:'fixture-old-key',imageBaseUrl:'https://relay.example',allowCustomEndpoint:true,allowCustomEndpointFallback:false});expect(s.compatibleImage?.baseUrl).toBe('https://old.example/v1');expect(getToken()).toBe('fixture-native-token');
});
it('rejects activation through both old store setters and normalizes imported provider flags',async()=>{
 const store=await import('./store');const before=store.getSettings();expect(()=>store.setSetting('imageProvider','openai-images')).toThrow('NovelAI');expect(()=>store.setCompatibleImageSettings({baseUrl:'https://old.example',model:'old'},'fixture-key','openai-images')).toThrow('NovelAI');expect(store.getSettings()).toEqual(before);
 store.writeStore({...store.readStore(),settings:{...before,imageProvider:'openai-images'}});expect(store.getSettings().imageProvider).toBe('novelai');
});
it.each(['images:saveCompatibleSettings','images:setCompatibleProvider','images:generateCompatible'])('old IPC channel %s returns a retired reply without a request',async channel=>{
 const send=vi.fn(),frame={},webContents={mainFrame:frame,isDestroyed:()=>false,send};const {registerCompatibleImageIpc}=await import('./compatible-settings-ipc');registerCompatibleImageIpc(()=>({isDestroyed:()=>false,webContents}) as any);
 const {getSettings}=await import('./store');const fetcher=vi.spyOn(globalThis,'fetch');const r=await fixture.handlers.get(channel)!({sender:webContents,senderFrame:frame},'openai-images',getSettings().imageServiceRevision);expect(r).toMatchObject({ok:false,code:'novelai-only'});expect(fetcher).not.toHaveBeenCalled();expect(JSON.stringify(r)).not.toContain('fixture-key');
});
it('only the owned renderer can access retired channels and settings notifications',async()=>{
 const mainFrame={},webContents={mainFrame,isDestroyed:()=>false,send:vi.fn()};const {registerCompatibleImageIpc}=await import('./compatible-settings-ipc');registerCompatibleImageIpc(()=>({isDestroyed:()=>false,webContents}) as any);
 expect(await fixture.handlers.get('images:generateCompatible')!({sender:{},senderFrame:mainFrame})).toMatchObject({ok:false,code:'stale'});
});
it.each(['read','configure','credential','clearCredential','test'])('Agent rejects retired image profile action %s before approval or networking',async action=>{
 const {createApiTools,desktopApiAdapter}=await import('./agent-api-tools');const approve=vi.fn(async()=>true),fetcher=vi.spyOn(globalThis,'fetch'),api=createApiTools(desktopApiAdapter(),approve);
 const r=await api.execute({tool:'langbai_api',sessionId:'fixture',args:{action,profile:'compatible-image',patch:{enabled:true},expectedRevision:'old'}});expect(r.ok).toBe(false);expect(approve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
