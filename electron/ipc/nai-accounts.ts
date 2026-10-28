import { app, ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NaiAccountsVault, accountCipherAvailable, type AccountVaultDocument, parsePortableNaiAccounts, ACCOUNT_VAULT_ERRORS, AccountVaultError } from './nai-accounts-vault';
import type { NaiAccountInput } from '../../src/nai-accounts';
import { officialNovelAiLogin, type OfficialLoginInput } from './nai-accounts-login';
import { activateNaiAccount, restoreNaiAccount, naiAccountsBusy, configureNaiAccountSummaries, rememberNaiAccountSummary, forgetNaiAccountSummary } from './nai-accounts-runtime';
import { readStore } from './store';
import {migrateLegacyNaiAccount} from './nai-accounts-migration';
import {validateNaiAccountReadOnly,requireNaiAccountValidation,backupAccountValidationError} from './nai-accounts-validation';
let vault: NaiAccountsVault | undefined;
let migrationIssue:string|undefined;
/** The selected account whose token this machine could not decrypt at startup; it was deselected. */
let unreadableSelectionId:string|undefined;
/** True when this machine's own encryption works, so an undecryptable token was made elsewhere. */
function cipherRoundTrips(){try{return safeStorage.decryptString(safeStorage.encryptString('probe'))==='probe';}catch{return false;}}
function getVault() {
  if (vault) return vault;
  const file = path.join(app.getPath('userData'), 'nai-accounts-v1.json');
  let document: AccountVaultDocument = { version: 1, accounts: [] };
  if (fs.existsSync(file)) {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (document.version !== 1 || !Array.isArray(document.accounts)) throw new Error(ACCOUNT_VAULT_ERRORS.unsupportedVault);
  }
  const candidate = new NaiAccountsVault(document, safeStorage, next => {
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  });
  try{migrateLegacyNaiAccount(candidate,readStore());}catch{migrationIssue='旧账户自动迁移未完成；原凭据和接口配置未删除。请从账户管理重新保存。';}
  configureNaiAccountSummaries({read:id=>candidate.accountSummary(id),write:(id,value)=>candidate.rememberAccountSummary(id,value)});
  const selectedId=candidate.selectedId();
  let snapshot:ReturnType<NaiAccountsVault['bind']>['snapshot']|undefined;
  if(selectedId){
    try{const lease=candidate.bind(selectedId);try{snapshot=lease.snapshot;}finally{lease.release();}}
    catch(error){
      // Only a token this machine cannot decrypt while its own encryption works (settings copied from
      // another PC or OS account) is deselected so the app can start. A locked, denied or unavailable
      // keychain keeps the selection and stops here as before.
      if(!(error instanceof AccountVaultError))throw error;
      if(!cipherRoundTrips())throw Error(ACCOUNT_VAULT_ERRORS.encryptionUnavailable);
      try{candidate.select(undefined);}catch{throw error;}
      unreadableSelectionId=selectedId;
    }
  }
  restoreNaiAccount(snapshot,candidate.managed());
  vault=candidate;
  return vault;
}

/** No startup migration is forced by a legacy-only export. */
export function exportNaiAccountsBackup(){
  if(!vault&&!fs.existsSync(path.join(app.getPath('userData'),'nai-accounts-v1.json')))return undefined;
  return getVault().exportBackup();
}
export async function prepareNaiAccountsBackupRestore(value:unknown){
  const portable=parsePortableNaiAccounts(value),v=getVault(),expected=v.revision();
  if(naiAccountsBusy())throw Error('账户操作正在执行');
  const summaries=new Map();
  // Reject the whole credential transaction if even the final account fails.
  for(const input of portable.accounts){
    const validation=await validateNaiAccountReadOnly(input);if(!validation.ok)throw backupAccountValidationError(input.label,validation);
    summaries.set(input.id,validation.account??{});
  }
  const prepared=v.prepareBackupRestore(portable,expected,summaries);
  return (write:()=>void,undo:()=>void)=>{
    if(naiAccountsBusy()||v.revision()!==expected)throw Error(ACCOUNT_VAULT_ERRORS.changedDuringImport);
    if(!portable.accounts.length){write();return;}
    // The two desktop files cannot share one filesystem rename. Compensate the
    // legacy settings write if the atomic vault persistence fails.
    write();
    try{activateNaiAccount(prepared.snapshot,prepared.commit);}
    catch(error){undo();throw error;}
    configureNaiAccountSummaries({read:id=>v.accountSummary(id),write:(id,s)=>v.rememberAccountSummary(id,s)});
  };
}

export function ensureNaiAccountsLoaded() { getVault(); }
export function registerNaiAccountsIpc() {
  // Lazy initialization: no real credentials are accessed by unit tests.
  ipcMain.handle('naiAccounts:list', () => getVault().list());
  ipcMain.handle('naiAccounts:state',()=>{
    const v=getVault(),selectedId=v.selectedId();
    // Only while nothing is selected and the unreadable account is still listed.
    const selectionUnreadable=!selectedId&&!!unreadableSelectionId&&v.list().some(account=>account.id===unreadableSelectionId);
    return {selectedId,busy:naiAccountsBusy(),migrationIssue,selectionUnreadable};
  });
  ipcMain.handle('naiAccounts:select',(_event,id?:string)=>{
    if(!id)throw Error('请选择已保存账户。');
    const v=getVault(); const lease=id?v.bind(id):undefined;
    try { const snapshot=lease?.snapshot; lease?.release(); activateNaiAccount(snapshot,()=>v.select(id)); return {selectedId:id}; }
    finally {lease?.release();}
  });
  ipcMain.handle('naiAccounts:login',async(_event,input:OfficialLoginInput)=>{
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    if(!input?.label?.trim() || input.label.length>120) return {ok:false,code:'auth',message:'请填写账户名称。'};
    if(!accountCipherAvailable(safeStorage)) throw Error(ACCOUNT_VAULT_ERRORS.encryptionUnavailable);
    let result: Awaited<ReturnType<typeof officialNovelAiLogin>>;
    try {result=await officialNovelAiLogin(input);} finally {input.password='';input.otp=undefined;}
    if(!result.ok) return result;
    const candidate:NaiAccountInput={label:input.label,method:'official-login',token:result.token,apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'};
    getVault().assertUnique(candidate);
    const validation=await validateNaiAccountReadOnly(candidate);
    if(!validation.ok)return {ok:false,code:'validation',message:'账户验证未通过，未保存。',validation};
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    const account=getVault().addVerified(crypto.randomUUID(),candidate,validation.account);
    // Stable summary is already durable; this refreshes cache without another vault write.
    if(validation.account)rememberNaiAccountSummary({...account,token:candidate.token},validation.account);
    return {ok:true,account};
  });
  ipcMain.handle('naiAccounts:migrate',()=>{const v=getVault();const result=migrateLegacyNaiAccount(v,readStore());const id=v.selectedId();if(id){const lease=v.bind(id);try{activateNaiAccount(lease.snapshot,()=>{});}finally{lease.release();}}return {migrated:result.migrated,message:'旧配置已自动迁移至账户列表；原存储保留。'};});
  ipcMain.handle('naiAccounts:add', async (_event, input: NaiAccountInput) => {
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    if(!accountCipherAvailable(safeStorage))throw Error(ACCOUNT_VAULT_ERRORS.encryptionUnavailable);
    const candidate={...input};
    getVault().assertUnique(candidate);
    const validation=await validateNaiAccountReadOnly(candidate);requireNaiAccountValidation(validation);
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    const account=getVault().addVerified(crypto.randomUUID(),candidate,validation.account);
    // Stable summary is already durable; this refreshes cache without another vault write.
    if(validation.account)rememberNaiAccountSummary({...account,token:candidate.token},validation.account);
    return account;
  });
  ipcMain.handle('naiAccounts:remove', (_event, id: string) => {
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    const v=getVault();
    forgetNaiAccountSummary(id);
    if(v.selectedId()!==id){if(v.selectedId())v.remove(id);else activateNaiAccount(undefined,()=>v.remove(id));return;}
    const next=v.list().find(account=>account.id!==id);
    let lease:ReturnType<NaiAccountsVault['bind']>|undefined;
    // When the next account cannot be decrypted on this machine, nothing stays selected.
    try{lease=next?v.bind(next.id):undefined;}
    catch(error){if(!(error instanceof AccountVaultError))throw error;activateNaiAccount(undefined,()=>v.remove(id,true));return;}
    try{const snapshot=lease?.snapshot;lease?.release();activateNaiAccount(snapshot,()=>v.remove(id));}
    finally{lease?.release();}
  });
  // Deliberate local UI action only: not returned by list/state or exposed to Agent tools.
  ipcMain.handle('naiAccounts:reveal',(_event,id:string)=>{const lease=getVault().bind(id);try{return lease.snapshot.token;}finally{lease.release();}});
  ipcMain.handle('naiAccounts:probe', async (_event, id: string) => {
    const lease=getVault().bind(id);
    try{const result=await validateNaiAccountReadOnly(lease.snapshot,true);rememberNaiAccountSummary(lease.snapshot,result.account??{});return {...result,subscription:result.account?'available':'skipped',protocol:'unverified',message:'Read-only API authentication only. Image generation protocol and billing are not tested.'};}
    finally{lease.release();}
  });
}
