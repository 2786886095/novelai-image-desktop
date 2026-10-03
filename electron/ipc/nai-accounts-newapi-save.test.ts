import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const fixture=vi.hoisted(()=>({root:'',handlers:new Map<string,Function>()}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:(name:string)=>name==='exe'?path.join(fixture.root,'app/desktop.exe'):name==='pictures'?path.join(fixture.root,'pictures'):fixture.root,getAppPath:()=>path.join(fixture.root,'app')},ipcMain:{handle:(name:string,fn:Function)=>fixture.handlers.set(name,fn)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s.split('').reverse().join('')),decryptString:(b:Buffer)=>b.toString().split('').reverse().join('')}}));
vi.mock('./proxy',()=>({proxyConfigForUrl:async()=>({proxy:false})}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'novelai-newapi-owned-'));fixture.handlers.clear();vi.resetModules();});
afterEach(()=>{vi.restoreAllMocks();if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('novelai-newapi-owned-'))throw Error('Unsafe test cleanup');fs.rmSync(fixture.root,{recursive:true,force:true});});
const call=(name:string,...args:unknown[])=>fixture.handlers.get(name)!({},...args);
const candidate={method:'relay',label:'OWNED QA',token:'QA_ONLY_NEWAPI_PLACEHOLDER',apiBaseUrl:'https://owned-novelai-relay.invalid',imageBaseUrl:''};
async function setup(){const store=await import('./store');store.setToken('QA_ONLY_PRISTINE');const api=await import('./nai-accounts');api.registerNaiAccountsIpc();call('naiAccounts:list');return store;}
it('actual verified IPC add saves a NovelAI-only New API credential encrypted; no fake subscription or Anlas',async()=>{
 const store=await setup();const axios=(await import('axios')).default;
 const original=fs.readFileSync(path.join(fixture.root,'novelai-image-desktop.json'));
 const post=vi.spyOn(axios,'post');
 vi.spyOn(axios,'get').mockImplementation(async(url,config)=>{
  expect(new URL(url).origin).toBe('https://owned-novelai-relay.invalid');expect(config?.headers?.Authorization).toBe('Bearer QA_ONLY_NEWAPI_PLACEHOLDER');
  return url.endsWith('/v1/models')?{status:200,data:{object:'list',data:[{id:'nai-diffusion-5-full'},{id:'gpt-image-1'}]}}:{status:200,data:'<!doctype html><html>SPA fallback</html>'};
 });
 const profile=await call('naiAccounts:add',candidate);
 expect(call('naiAccounts:list')).toContainEqual(profile);
 const disk=fs.readFileSync(path.join(fixture.root,'nai-accounts-v1.json'),'utf8');expect(disk).not.toContain(candidate.token);
 expect(await call('naiAccounts:probe',profile.id)).toMatchObject({ok:true,modelIds:['nai-diffusion-5-full'],subscription:'skipped',protocol:'unverified'});
 call('naiAccounts:select',profile.id);expect(store.getToken()).toBe(candidate.token);
 const runtime=await import('./nai-accounts-runtime');const summary=runtime.getNaiAccountSummary(runtime.currentNaiAccount());expect(summary.anlasBalance).toBeUndefined();expect(summary.hasActiveSubscription).not.toBe(true);
 expect(fs.readFileSync(path.join(fixture.root,'novelai-image-desktop.json'))).toEqual(original);expect(post).not.toHaveBeenCalled();
});
for(const reject of ['auth','unrelated-models'] as const){
 it(`actual IPC ${reject} rejects save without changing vault, selection or pristine store`,async()=>{
  const store=await setup();const axios=(await import('axios')).default;
  const file=path.join(fixture.root,'nai-accounts-v1.json'),before=fs.readFileSync(file),selected=call('naiAccounts:state').selectedId;
  vi.spyOn(axios,'get').mockImplementation(async(url)=>url.endsWith('/v1/models')?reject==='auth'?{status:401}:{status:200,data:{object:'list',data:[{id:'gpt-image-1'}]}}:{status:404});
  await expect(call('naiAccounts:add',candidate)).rejects.toThrow('NAI_ACCOUNT_VALIDATION');
  expect(fs.readFileSync(file)).toEqual(before);expect(call('naiAccounts:state').selectedId).toBe(selected);expect(store.getToken()).toBe('QA_ONLY_PRISTINE');
 });
}
it('failed probe retains last Anlas balance as stale cache, never marks a subscription available',async()=>{
 await setup();const axios=(await import('axios')).default;
 const get=vi.spyOn(axios,'get').mockResolvedValue({status:200,data:{subscription:{tier:0,trainingStepsLeft:19}}});
 const profile=call('naiAccounts:list')[0];await call('naiAccounts:probe',profile.id);
 const runtime=await import('./nai-accounts-runtime');
 expect(runtime.getNaiAccountSummary(runtime.currentNaiAccount())).toMatchObject({anlasBalance:19,stale:false});
 get.mockResolvedValue({status:401});expect(await call('naiAccounts:probe',profile.id)).toMatchObject({ok:false,subscription:'skipped'});
 expect(runtime.getNaiAccountSummary(runtime.currentNaiAccount())).toMatchObject({anlasBalance:19,stale:true,hasActiveSubscription:false});
});
