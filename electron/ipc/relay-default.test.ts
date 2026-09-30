import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:()=>fixture.root,getAppPath:()=>fixture.root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-default-'));vi.resetModules();});
afterEach(()=>{
 vi.restoreAllMocks();
 if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('relay-default-'))throw Error('Invalid fixture cleanup');
 fs.rmSync(fixture.root,{recursive:true,force:true});
});
it('enables relay endpoints for new users without enabling official retry',async()=>{
 const {getSettings}=await import('./store');const settings=getSettings();
 expect(settings.allowCustomEndpoint).toBe(true);
 expect(settings.allowCustomEndpointFallback).toBe(false);
 expect(settings.imageBaseUrl).toBe('https://image.novelai.net');
});
it.each([false,true])('preserves explicit saved relay choice %s on restart',async enabled=>{
 const store=await import('./store');store.setSetting('allowCustomEndpoint',enabled);
 vi.resetModules();const restored=await import('./store');
 expect(restored.getSetting('allowCustomEndpoint')).toBe(enabled);
 expect(restored.getSetting('allowCustomEndpointFallback')).toBe(false);
});
it('uses the new default for legacy settings missing the field without replacing relay URL',async()=>{
 fs.writeFileSync(path.join(fixture.root,'novelai-image-desktop.json'),JSON.stringify({settings:{imageBaseUrl:'https://relay.example',allowCustomEndpointFallback:false}}));
 const {getSettings}=await import('./store');const settings=getSettings();
 expect(settings.allowCustomEndpoint).toBe(true);
 expect(settings.imageBaseUrl).toBe('https://relay.example');
 expect(settings.allowCustomEndpointFallback).toBe(false);
});
