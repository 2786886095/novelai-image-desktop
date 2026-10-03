import { it, expect, vi } from 'vitest';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import JSZip from 'jszip';
const fixture=vi.hoisted(()=>({root:'',handlers:new Map<string,Function>()}));
vi.mock('electron',()=>({app:{isPackaged:false,getVersion:()=> 'fixture',getPath:(name:string)=>name==='exe'?path.join(fixture.root,'app','desktop.exe'):name==='pictures'?path.join(fixture.root,'pictures'):fixture.root,getAppPath:()=>path.join(fixture.root,'app')},dialog:{},ipcMain:{handle:(name:string,fn:Function)=>fixture.handlers.set(name,fn)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()}}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>({conversations:[],characters:[],personas:[],lorebooks:[],samplerPresets:[]}),agentAttachmentsDirectory:()=>path.join(fixture.root,'attachments'),mergeImportedAgentWorkspace:vi.fn(()=>({imported:0,skipped:0,renamed:0}))}));
vi.mock('./artist-favorites',()=>({ARTIST_FAVORITE_COLLECTIONS:['random','v5-repair','artist-string-draw'],loadArtistFavoriteLibrary:async()=>({collections:{random:[],'v5-repair':[],'artist-string-draw':[]}})}));
vi.mock('./reference-presets',()=>({listReferencePresets:async()=>({groups:[],presets:[]})}));
it('API category actual export/fresh restore retains saved inactive accounts and selected binding',async()=>{
 const owned=fs.mkdtempSync(path.join(os.tmpdir(),'owned-account-vault-backup-'));
 try{
  fixture.root=path.join(owned,'source');fs.mkdirSync(fixture.root);vi.resetModules();
  const source=await import('./store');source.writeStore({settings:{...source.defaultSettings(),outputDir:path.join(fixture.root,'pictures'),backupDir:path.join(fixture.root,'backups')},history:[],historyGroups:[],convertHistory:[],reverseHistory:[]});source.setToken('fixture-legacy-only');
  const axios=(await import('axios')).default;const get=vi.spyOn(axios,'get').mockResolvedValue({status:200,data:{subscription:{tier:1,active:true,trainingStepsLeft:{fixedTrainingStepsLeft:42,purchasedTrainingSteps:0}}}});
  (await import('./nai-accounts')).registerNaiAccountsIpc();const call=(name:string,...args:unknown[])=>fixture.handlers.get(name)!({},...args);
  const official=await call('naiAccounts:add',{label:'saved official',method:'token',token:'fixture-inactive-official',apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'});
  const relay=await call('naiAccounts:add',{label:'selected relay',method:'relay',token:'fixture-relay-independent',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://images.example.invalid/raw'});
  call('naiAccounts:select',relay.id);const expected=call('naiAccounts:list');expect(expected.length).toBe(3);expect(source.getToken()).toBe('fixture-relay-independent');expect(expected.find((a:any)=>a.id===official.id)).toBeDefined();
  get.mockClear();const exportResult=await (await import('./data-backup')).exportDataBackup({categories:['apiCredentials'],destination:'internal'});expect(exportResult.ok,exportResult.message).toBe(true);expect(get).not.toHaveBeenCalled();
  const archiveBytes=fs.readFileSync(exportResult.path!);const zip=await JSZip.loadAsync(archiveBytes);expect(zip.file('data/configuration.json')).toBeNull();
  const incoming=path.join(owned,'export.naisbackup');fs.writeFileSync(incoming,archiveBytes);
  fixture.root=path.join(owned,'destination');fs.mkdirSync(fixture.root);fixture.handlers.clear();vi.resetModules();
  const destination=await import('./store');destination.writeStore({settings:{...destination.defaultSettings(),outputDir:path.join(fixture.root,'pictures'),backupDir:path.join(fixture.root,'backups')},history:[],historyGroups:[],convertHistory:[],reverseHistory:[]});
  const restored=await (await import('./data-backup')).importDataBackup({path:incoming,categories:['apiCredentials'],confirmConfigurationOverwrite:true});expect(restored.ok,restored.message).toBe(true);
  (await import('./nai-accounts')).registerNaiAccountsIpc();const actual=call('naiAccounts:list');
  // Structural assertions do not print synthetic tokens or decrypted archives.
  expect(actual.map((a:any)=>[a.label,a.method,a.apiBaseUrl,a.imageBaseUrl]).sort()).toEqual(expected.map((a:any)=>[a.label,a.method,a.apiBaseUrl,a.imageBaseUrl]).sort());
  const active=call('naiAccounts:state');expect(actual.find((a:any)=>a.id===active.selectedId)?.label).toBe('selected relay');expect(destination.getSettings().apiBaseUrl).toBe('https://relay.example.invalid/prefix');
  const reopened=await import('./nai-accounts-runtime');expect(reopened).toBeDefined();
 }finally{vi.restoreAllMocks();if(path.dirname(owned)!==path.resolve(os.tmpdir())||!path.basename(owned).startsWith('owned-account-vault-backup-'))throw Error('Unsafe owned fixture cleanup');fs.rmSync(owned,{recursive:true,force:true});}
});
