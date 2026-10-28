import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { validateAccountProfile, relayDashboardOrigin } from '../../src/nai-accounts';
import { NaiAccountsVault, accountCipherAvailable, parsePortableNaiAccounts, ACCOUNT_VAULT_ERRORS, type AccountVaultDocument } from './nai-accounts-vault';
const input = { label:'fixture', method:'token' as const, token:'synthetic-fixture-only', apiBaseUrl:'https://api.novelai.net', imageBaseUrl:'https://image.novelai.net' };
function setup(available=true) {
 let disk:AccountVaultDocument={version:1,accounts:[]};
 const cipher={isEncryptionAvailable:()=>available,encryptString:(s:string)=>Buffer.from(s.split('').reverse().join('')),decryptString:(b:Buffer)=>b.toString().split('').reverse().join('')};
 return {vault:new NaiAccountsVault(disk,cipher,d=>{disk=d;}),disk:()=>disk};
}
// Fake cipher tests policy only, not OS DPAPI availability.
describe('account vault policy',()=>{
 it('refuses Linux basic_text before encrypt/decrypt and preserves existing ciphertext',()=>{const cipher={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'basic_text',encryptString:vi.fn(()=>Buffer.from('weak')),decryptString:vi.fn(()=>input.token)};const document:AccountVaultDocument={version:1,accounts:[{id:'old',label:input.label,method:input.method,apiBaseUrl:input.apiBaseUrl,imageBaseUrl:input.imageBaseUrl,encryptedToken:'preserve-existing-ciphertext'}]};const original=JSON.stringify(document),persist=vi.fn();const vault=new NaiAccountsVault(document,cipher,persist);expect(accountCipherAvailable(cipher)).toBe(false);expect(()=>vault.add('new',input)).toThrow(ACCOUNT_VAULT_ERRORS.encryptionUnavailable);expect(()=>vault.bind('old')).toThrow(ACCOUNT_VAULT_ERRORS.encryptionUnavailable);expect(cipher.encryptString).not.toHaveBeenCalled();expect(cipher.decryptString).not.toHaveBeenCalled();expect(persist).not.toHaveBeenCalled();expect(JSON.stringify(document)).toBe(original);});
 it('persists blank/omitted relay image base as the explicit API base',()=>{const s=setup();const relay={...input,method:'relay' as const,apiBaseUrl:'https://relay.invalid/raw',imageBaseUrl:'   '};const account=s.vault.add('relay',relay);expect(account.imageBaseUrl).toBe(relay.apiBaseUrl);const lease=s.vault.bind('relay');expect(lease.snapshot.imageBaseUrl).toBe(relay.apiBaseUrl);lease.release();const second=s.vault.add('relay-2',{...relay,token:'synthetic-distinct-key',imageBaseUrl:undefined});expect(second.imageBaseUrl).toBe(relay.apiBaseUrl);});
 it('keeps secrets out of metadata and persists only ciphertext',()=>{const s=setup();s.vault.add('a',input);expect(JSON.stringify(s.vault.list())).not.toContain(input.token);expect(JSON.stringify(s.disk())).not.toContain(input.token);expect(s.vault.bind('a').snapshot.token).toBe(input.token);});
 it('fails closed when encryption unavailable',()=>{const s=setup(false);expect(()=>s.vault.add('a',input)).toThrow();expect(s.disk().accounts).toHaveLength(0);});
 it('binds frozen endpoints and locks deletion until idempotent release',()=>{const s=setup();s.vault.add('a',input);const lease=s.vault.bind('a');expect(Object.isFrozen(lease.snapshot)).toBe(true);expect(()=>s.vault.remove('a')).toThrow();lease.release();lease.release();s.vault.remove('a');expect(s.vault.list()).toHaveLength(0);});
 it('rejects official tokens on other hosts and relay tokens on official hosts',()=>{expect(()=>validateAccountProfile({...input,apiBaseUrl:'https://example.org'})).toThrow();expect(()=>validateAccountProfile({...input,method:'relay'})).toThrow();});
 it('rejects dashboard URLs and credential-bearing URLs',()=>{expect(()=>validateAccountProfile({...input,method:'relay',apiBaseUrl:'https://relay.example/dashboard/overview',imageBaseUrl:'https://relay.example'})).toThrow();expect(()=>validateAccountProfile({...input,method:'relay',apiBaseUrl:'https://u:p@relay.example',imageBaseUrl:'https://relay.example'})).toThrow();});
 it('normalizes dashboard only by explicit relay helper',()=>{expect(relayDashboardOrigin('https://newapi.chinahk.qzz.io/dashboard/overview')).toBe('https://newapi.chinahk.qzz.io');});
 it('retains old document when persistence fails',()=>{const s=setup();const v=new NaiAccountsVault(s.disk(),{isEncryptionAvailable:()=>true,encryptString:()=>Buffer.from('cipher'),decryptString:()=>''},()=>{throw new Error('disk');});expect(()=>v.add('a',input)).toThrow('disk');expect(v.list()).toHaveLength(0);});
});
it('uses Chinese messages on the paths backup import and export show verbatim',()=>{
 const source=fs.readFileSync('electron/ipc/nai-accounts-vault.ts','utf8')+fs.readFileSync('electron/ipc/nai-accounts.ts','utf8');
 for(const english of ['Invalid portable NovelAI account backup','Account vault changed during backup import','OS credential encryption unavailable','Account backup exceeds saved account limit','Unsupported account vault'])expect(source).not.toContain(english);
 for(const message of Object.values(ACCOUNT_VAULT_ERRORS))expect(message).toMatch(/[\u4e00-\u9fff]/);
 expect(()=>parsePortableNaiAccounts({version:2})).toThrow(ACCOUNT_VAULT_ERRORS.invalidBackup);
});
it('reports unreadable archive addresses and undecryptable saved accounts in Chinese',()=>{
 const archive=(apiBaseUrl:string,imageBaseUrl:string)=>({version:1,selectedId:null,accounts:[{id:'a',label:'x',method:'relay',token:'synthetic',apiBaseUrl,imageBaseUrl}]});
 expect(()=>parsePortableNaiAccounts(archive('https://relay.example.invalid/raw',''))).toThrow(ACCOUNT_VAULT_ERRORS.invalidBackup);
 expect(()=>parsePortableNaiAccounts(archive('https://relay.example.invalid/%E0%A4%A','https://relay.example.invalid/raw'))).toThrow(ACCOUNT_VAULT_ERRORS.invalidBackup);
 // safeStorage cannot read ciphertext written on another machine or OS account.
 const cipher={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:()=>{throw Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.');}};
 const vault=new NaiAccountsVault({version:1,accounts:[{id:'old',label:input.label,method:input.method,apiBaseUrl:input.apiBaseUrl,imageBaseUrl:input.imageBaseUrl,encryptedToken:'AAAA'}]},cipher,()=>{});
 expect(()=>vault.bind('old')).toThrow(ACCOUNT_VAULT_ERRORS.decryptFailed);
 expect(()=>vault.exportBackup()).toThrow(ACCOUNT_VAULT_ERRORS.decryptFailed);
});
