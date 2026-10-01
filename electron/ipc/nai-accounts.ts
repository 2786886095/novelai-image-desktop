import { app, ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NaiAccountsVault, accountCipherAvailable, type AccountVaultDocument } from './nai-accounts-vault';
import type { NaiAccountInput } from '../../src/nai-accounts';
import { officialNovelAiLogin, type OfficialLoginInput } from './nai-accounts-login';
import { activateNaiAccount, restoreNaiAccount, naiAccountsBusy } from './nai-accounts-runtime';
import { readStore } from './store';
import {migrateLegacyNaiAccount} from './nai-accounts-migration';
import {validateNaiAccountReadOnly,requireNaiAccountValidation} from './nai-accounts-validation';
let vault: NaiAccountsVault | undefined;
let migrationIssue:string|undefined;
function getVault() {
  if (vault) return vault;
  const file = path.join(app.getPath('userData'), 'nai-accounts-v1.json');
  let document: AccountVaultDocument = { version: 1, accounts: [] };
  if (fs.existsSync(file)) {
    document = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (document.version !== 1 || !Array.isArray(document.accounts)) throw new Error('Unsupported account vault');
  }
  const candidate = new NaiAccountsVault(document, safeStorage, next => {
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  });
  try{migrateLegacyNaiAccount(candidate,readStore());}catch{migrationIssue='旧账户自动迁移未完成；原凭据和接口配置未删除。请从账户管理重新保存。';}
  const selectedId=candidate.selectedId();
  if(selectedId) { const lease=candidate.bind(selectedId); try{restoreNaiAccount(lease.snapshot,candidate.managed());}finally{lease.release();} }
  else restoreNaiAccount(undefined,candidate.managed());
  vault=candidate;
  return vault;
}
export function ensureNaiAccountsLoaded() { getVault(); }
export function registerNaiAccountsIpc() {
  // Lazy initialization: no real credentials are accessed by unit tests.
  ipcMain.handle('naiAccounts:list', () => getVault().list());
  ipcMain.handle('naiAccounts:state',()=>({selectedId:getVault().selectedId(),busy:naiAccountsBusy(),migrationIssue}));
  ipcMain.handle('naiAccounts:select',(_event,id?:string)=>{
    if(!id)throw Error('请选择已保存账户。');
    const v=getVault(); const lease=id?v.bind(id):undefined;
    try { const snapshot=lease?.snapshot; lease?.release(); activateNaiAccount(snapshot,()=>v.select(id)); return {selectedId:id}; }
    finally {lease?.release();}
  });
  ipcMain.handle('naiAccounts:login',async(_event,input:OfficialLoginInput)=>{
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    if(!input?.label?.trim() || input.label.length>120) return {ok:false,code:'auth',message:'请填写账户名称。'};
    if(!accountCipherAvailable(safeStorage)) throw Error('OS credential encryption unavailable');
    let result: Awaited<ReturnType<typeof officialNovelAiLogin>>;
    try {result=await officialNovelAiLogin(input);} finally {input.password='';input.otp=undefined;}
    if(!result.ok) return result;
    const candidate:NaiAccountInput={label:input.label,method:'official-login',token:result.token,apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'};
    const validation=await validateNaiAccountReadOnly(candidate);
    if(!validation.ok)return {ok:false,code:'validation',message:'账户验证未通过，未保存。',validation};
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    const account=getVault().add(crypto.randomUUID(),candidate);
    return {ok:true,account};
  });
  ipcMain.handle('naiAccounts:migrate',()=>{const v=getVault();const result=migrateLegacyNaiAccount(v,readStore());const id=v.selectedId();if(id){const lease=v.bind(id);try{activateNaiAccount(lease.snapshot,()=>{});}finally{lease.release();}}return {migrated:result.migrated,message:'旧配置已自动迁移至账户列表；原存储保留。'};});
  ipcMain.handle('naiAccounts:add', async (_event, input: NaiAccountInput) => {
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    if(!accountCipherAvailable(safeStorage))throw Error('OS credential encryption unavailable');
    const candidate={...input};
    requireNaiAccountValidation(await validateNaiAccountReadOnly(candidate));
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    return getVault().add(crypto.randomUUID(),candidate);
  });
  ipcMain.handle('naiAccounts:remove', (_event, id: string) => {
    if(naiAccountsBusy())throw Error('账户操作正在执行');
    const v=getVault();
    if(v.selectedId()!==id){if(v.selectedId())v.remove(id);else activateNaiAccount(undefined,()=>v.remove(id));return;}
    const next=v.list().find(account=>account.id!==id);
    const lease=next?v.bind(next.id):undefined;
    try{const snapshot=lease?.snapshot;lease?.release();activateNaiAccount(snapshot,()=>v.remove(id));}
    finally{lease?.release();}
  });
  // Deliberate local UI action only: not returned by list/state or exposed to Agent tools.
  ipcMain.handle('naiAccounts:reveal',(_event,id:string)=>{const lease=getVault().bind(id);try{return lease.snapshot.token;}finally{lease.release();}});
  ipcMain.handle('naiAccounts:probe', async (_event, id: string) => {
    const lease=getVault().bind(id);
    try{const result=await validateNaiAccountReadOnly(lease.snapshot,true);return {...result,subscription:result.ok?'available':'skipped',protocol:'unverified',message:'Read-only API authentication only. Image generation protocol and billing are not tested.'};}
    finally{lease.release();}
  });
}
