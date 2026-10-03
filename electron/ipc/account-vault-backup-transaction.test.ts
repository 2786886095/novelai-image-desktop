import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:'',handlers:new Map<string,Function>()}));
vi.mock('electron',()=>({app:{isPackaged:false,getVersion:()=> 'fixture',getPath:(n:string)=>n==='exe'?path.join(fixture.root,'app','desktop.exe'):n==='pictures'?path.join(fixture.root,'pictures'):fixture.root,getAppPath:()=>path.join(fixture.root,'app')},dialog:{},ipcMain:{handle:(n:string,f:Function)=>fixture.handlers.set(n,f)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>({conversations:[],characters:[],personas:[],lorebooks:[],samplerPresets:[]}),agentAttachmentsDirectory:()=>path.join(fixture.root,'attachments'),mergeImportedAgentWorkspace:vi.fn(()=>({imported:0,skipped:0,renamed:0}))}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:async()=>({collections:{random:[],'v5-repair':[],'artist-string-draw':[]}})}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]})}));
const rows=[
 {id:'official',label:'saved official',method:'token',token:'fixture-official',apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net',accountSummary:{tierName:'Paper',tierLevel:0,anlasBalance:23,hasActiveSubscription:false}},
 {id:'login',label:'saved login',method:'official-login',token:'fixture-login',apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net',accountSummary:{tierName:'Paper',tierLevel:0,anlasBalance:31,hasActiveSubscription:false}},
 {id:'relay',label:'selected relay',method:'relay',token:'fixture-relay',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://images.example.invalid/raw',accountSummary:{tierName:'Paper',tierLevel:0,anlasBalance:42,hasActiveSubscription:false}},
];
const portable=()=>({version:1,selectedId:'relay',accounts:structuredClone(rows)});
const digest=(value:unknown)=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
async function owned(work:(ctx:any)=>Promise<void>){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owned-account-vault-transaction-'));
 try{
  fixture.root=root;fixture.handlers.clear();vi.resetModules();
  const store=await import('./store');store.writeStore({settings:{...store.defaultSettings(),outputDir:path.join(root,'images'),backupDir:path.join(root,'backups')},history:[],historyGroups:[],convertHistory:[],reverseHistory:[]});
  const requests:Array<{url:string;keyKind:string;method:string}>=[];
  const axios=(await import('axios')).default;
  const get=vi.spyOn(axios,'get').mockImplementation(async(url:any,config:any)=>{
   const u=new URL(url),relay=String(config.headers.Authorization).includes('fixture-relay');
   requests.push({url,keyKind:relay?'relay':'official',method:'GET'});
   expect(u.hostname.endsWith('novelai.net')).toBe(!relay);
   return relay?(u.pathname.endsWith('/models')?{status:200,data:{object:'list',data:[{id:'nai-diffusion-5-full'}]}}:{status:404,data:null}):
    {status:200,data:{subscription:{tier:0,active:false,trainingStepsLeft:{fixedTrainingStepsLeft:42,purchasedTrainingSteps:0}}}};
  });
  const post=vi.spyOn(axios,'post').mockImplementation(async()=>{throw Error('Paid request forbidden in backup');});
  const accounts=await import('./nai-accounts');accounts.registerNaiAccountsIpc();
  const call=(name:string,...args:unknown[])=>fixture.handlers.get(name)!({},...args);
  const backup=await import('./data-backup');
  async function archive(value:unknown,settings:Record<string,unknown>={}){
   const zip=new JSZip();zip.file('manifest.json',JSON.stringify({format:'langbai-novelai-studio-backup',version:1,categories:['apiCredentials']}));
   zip.file('data/api-credentials.json',JSON.stringify({novelAiAccounts:value,token:'',settings}));
   const file=path.join(root,crypto.randomUUID()+'.naisbackup');fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));return file;
  }
  const restore=(file:string)=>backup.importDataBackup({path:file,categories:['apiCredentials'],confirmConfigurationOverwrite:true});
  await work({root,store,requests,get,post,accounts,call,backup,archive,restore});expect(post).not.toHaveBeenCalled();
 }finally{vi.restoreAllMocks();if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('owned-account-vault-transaction-'))throw Error('Unsafe owned cleanup');fs.rmSync(root,{recursive:true,force:true});}
}
it('public restore re-verifies all methods, retains relay cached Anlas and deduplicates repeated endpoint+Token',()=>owned(async c=>{
 const file=await c.archive(portable());expect((await c.restore(file)).ok).toBe(true);
 expect(c.call('naiAccounts:list').length).toBe(3);expect(c.call('naiAccounts:state').selectedId).toBe('relay');
 const runtime=await import('./nai-accounts-runtime');expect(runtime.getNaiAccountSummary()).toMatchObject({anlasBalance:42,stale:true,hasActiveSubscription:false});
 const disk=fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8');expect(rows.every(r=>!disk.includes(r.token))).toBe(true);
 c.requests.length=0;expect((await c.restore(file)).ok).toBe(true);expect(c.call('naiAccounts:list').length).toBe(3);expect(c.requests.length).toBe(5);
 const exported=await c.backup.exportDataBackup({categories:['apiCredentials'],destination:'internal'});expect(exported.ok).toBe(true);
 if(process.env.ACCOUNT_VAULT_INTEROP){fs.mkdirSync(process.env.ACCOUNT_VAULT_INTEROP,{recursive:true});fs.copyFileSync(exported.path,path.join(process.env.ACCOUNT_VAULT_INTEROP,'desktop.naisbackup'));}
}));
it('a failed second authentication leaves all old accounts, selected runtime and other API settings untouched',()=>owned(async c=>{
 const old=await c.call('naiAccounts:add',{...rows[2],label:'existing'});c.call('naiAccounts:select',old.id);
 const before=digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8')),revision=(await import('./nai-accounts-runtime')).naiAccountRevision(),settings=digest(c.store.getSettings());
 c.get.mockImplementationOnce(async()=>({status:200,data:{subscription:{tier:0,trainingStepsLeft:42}}})).mockImplementationOnce(async()=>({status:401,data:null}));
 const result=await c.restore(await c.archive(portable(),{visionApiKey:'fixture-incoming-other-key'}));expect(result.ok).toBe(false);expect(result.message).toContain('NAI_ACCOUNT_VALIDATION:auth:401');
 expect(digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'))).toBe(before);expect((await import('./nai-accounts-runtime')).naiAccountRevision()).toBe(revision);expect(digest(c.store.getSettings())).toBe(settings);
}));
it('invalid schema, IDs, selected binding, secret metadata and official/relay cross routing reject before GET',()=>owned(async c=>{
 const invalid=[{...portable(),selectedId:'missing'}, {...portable(),accounts:[rows[0],rows[0]]}, {...portable(),password:'forbidden'}, {...portable(),accounts:[{...rows[2],imageBaseUrl:'https://image.novelai.net'}]}, {...portable(),accounts:[{...rows[0],accountSummary:{token:'forbidden'}}]}, {...portable(),accounts:Array.from({length:129},(_,i)=>({...rows[0],id:'id'+i}))}];
 for(const value of invalid){c.get.mockClear();expect((await c.restore(await c.archive(value))).ok).toBe(false);expect(c.get).not.toHaveBeenCalled();expect(c.call('naiAccounts:list').length).toBe(0);}
}));
it('vault persistence failure compensates legacy settings and keeps previous active binding',()=>owned(async c=>{
 const old=await c.call('naiAccounts:add',rows[2]);c.call('naiAccounts:select',old.id);
 const before=digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8')),settings=digest(c.store.readStore()),revision=(await import('./nai-accounts-runtime')).naiAccountRevision();
 const write=fs.writeFileSync.bind(fs),spy=vi.spyOn(fs,'writeFileSync').mockImplementation(((file:any,...args:any[])=>{if(String(file).includes('nai-accounts-v1.json.'))throw Error('fixture vault write failed');return (write as Function)(file,...args);}) as any);
 try{const result=await c.restore(await c.archive(portable(),{visionApiModel:'incoming'}));expect(result.ok).toBe(false);expect(result.message).toContain('fixture vault write failed');}finally{spy.mockRestore();}
 expect(digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'))).toBe(before);expect(digest(c.store.readStore())).toBe(settings);expect((await import('./nai-accounts-runtime')).naiAccountRevision()).toBe(revision);
}));
it('collision of source IDs is remapped without replacing unrelated account or cached balance',()=>owned(async c=>{
 const v=await c.call('naiAccounts:add',{...rows[0],token:'fixture-other-official',label:'Existing unrelated'});c.call('naiAccounts:select',v.id);
 const incoming=portable();incoming.accounts[2].id=v.id;incoming.selectedId=v.id;
 expect((await c.restore(await c.archive(incoming))).ok).toBe(true);const list=c.call('naiAccounts:list');expect(list.length).toBe(4);expect(list.find((a:any)=>a.id===v.id).label).toBe('Existing unrelated');expect(list.find((a:any)=>a.id===c.call('naiAccounts:state').selectedId).label).toBe('selected relay');
}));
it('empty portable archives preserve current account and configuration-only export contains no vault or Token',()=>owned(async c=>{
 const v=await c.call('naiAccounts:add',rows[2]);c.call('naiAccounts:select',v.id);const before=digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'));
 expect((await c.restore(await c.archive({version:1,selectedId:null,accounts:[]}))).ok).toBe(true);expect(digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'))).toBe(before);
 const out=await c.backup.exportDataBackup({categories:['configuration'],destination:'internal'});expect(out.ok).toBe(true);const zip=await JSZip.loadAsync(fs.readFileSync(out.path));expect(zip.file('data/api-credentials.json')).toBeNull();const data=await zip.file('data/configuration.json')!.async('string');expect(/novelAiAccounts|encryptedToken|fixture-relay/.test(data)).toBe(false);
}));
it('same normalized main endpoint and Token deduplicate even when the image endpoint or label differ',()=>owned(async c=>{
 const p=portable();p.accounts.push({...rows[2],id:'relay-alias',label:'alias',apiBaseUrl:'https://RELAY.example.invalid:443/prefix/',imageBaseUrl:'https://other-images.example.invalid/raw'});p.selectedId='relay-alias';
 expect((await c.restore(await c.archive(p))).ok).toBe(true);expect(c.call('naiAccounts:list').length).toBe(3);expect(c.call('naiAccounts:state').selectedId).toBe('relay');
}));
it('a concurrent verified save invalidates staged restore and retains the newer account',()=>owned(async c=>{
 const handler=c.get.getMockImplementation();c.get.mockImplementationOnce(async(...args:any[])=>{
  const p=await c.call('naiAccounts:add',{...rows[2],token:'fixture-relay-existing',label:'newer saved'});c.call('naiAccounts:select',p.id);return handler(...args);
 });
 const result=await c.restore(await c.archive(portable()));expect(result.ok).toBe(false);expect(result.message).toContain('Account vault changed');expect(c.call('naiAccounts:list').length).toBe(1);expect(c.call('naiAccounts:list')[0].label).toBe('newer saved');
}));
it('ambiguous migrated routing remains exportable but cannot silently bypass validation on restore',()=>owned(async c=>{
 c.store.setToken('fixture-legacy-unclassified');c.store.setSetting('allowCustomEndpoint',true);c.store.setSetting('imageBaseUrl','https://legacy-images.example.invalid/raw');
 expect(c.call('naiAccounts:list').length).toBe(1);c.get.mockClear();const out=await c.backup.exportDataBackup({categories:['apiCredentials'],destination:'internal'});expect(out.ok,out.message).toBe(true);expect(c.get).not.toHaveBeenCalled();
 const bytes=await JSZip.loadAsync(fs.readFileSync(out.path)),api=JSON.parse(await bytes.file('data/api-credentials.json')!.async('string'));
 expect(api.novelAiAccounts.accounts.length).toBe(1);expect(!!api.novelAiAccounts.accounts[0].legacyConfiguration).toBe(true);
 const before=digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'));expect((await c.restore(out.path)).ok).toBe(false);expect(c.get).not.toHaveBeenCalled();expect(digest(fs.readFileSync(path.join(c.root,'nai-accounts-v1.json'),'utf8'))).toBe(before);
}));
it('actual mobile returned ZIP restores all methods and relay binding on fresh desktop',()=>owned(async c=>{
 const dir=process.env.ACCOUNT_VAULT_INTEROP;if(!dir||process.env.ACCOUNT_VAULT_INTEROP_STAGE!=='return')return;
 const result=await c.restore(path.join(dir,'mobile.naisbackup'));expect(result.ok,result.message).toBe(true);expect(c.call('naiAccounts:list').map((a:any)=>a.method).sort()).toEqual(['official-login','relay','token']);expect(c.store.getSettings().imageBaseUrl).toBe('https://images.example.invalid/raw');expect((await import('./nai-accounts-runtime')).getNaiAccountSummary().anlasBalance).toBe(42);
}));
