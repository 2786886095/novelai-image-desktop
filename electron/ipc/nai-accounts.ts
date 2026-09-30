import { app, ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { NaiAccountsVault, accountCipherAvailable, type AccountVaultDocument } from './nai-accounts-vault';
import type { NaiAccountInput } from '../../src/nai-accounts';
import { officialNovelAiLogin, type OfficialLoginInput } from './nai-accounts-login';
import { activateNaiAccount, restoreNaiAccount, naiAccountsBusy } from './nai-accounts-runtime';
import { readStore, getSettings } from './store';
import { proxyConfigForUrl } from './proxy';
let vault: NaiAccountsVault | undefined;
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
  if(document.selectedId) { const lease=candidate.bind(document.selectedId); try{restoreNaiAccount(lease.snapshot);}finally{lease.release();} }
  vault=candidate;
  return vault;
}
export function ensureNaiAccountsLoaded() { getVault(); }
export function registerNaiAccountsIpc() {
  // Lazy initialization: no real credentials are accessed by unit tests.
  ipcMain.handle('naiAccounts:list', () => getVault().list());
  ipcMain.handle('naiAccounts:state',()=>({selectedId:getVault().selectedId(),busy:naiAccountsBusy()}));
  ipcMain.handle('naiAccounts:select',(_event,id?:string)=>{
    const v=getVault(); const lease=id?v.bind(id):undefined;
    try { const snapshot=lease?.snapshot; lease?.release(); activateNaiAccount(snapshot,()=>v.select(id)); return {selectedId:id}; }
    finally {lease?.release();}
  });
  ipcMain.handle('naiAccounts:login',async(_event,input:OfficialLoginInput)=>{
    if(!input?.label?.trim() || input.label.length>120) return {ok:false,code:'auth',message:'请填写账户名称。'};
    if(!accountCipherAvailable(safeStorage)) throw Error('OS credential encryption unavailable');
    let result: Awaited<ReturnType<typeof officialNovelAiLogin>>;
    try {result=await officialNovelAiLogin(input);} finally {input.password='';input.otp=undefined;}
    if(!result.ok) return result;
    const account=getVault().add(crypto.randomUUID(),{label:input.label,method:'official-login',token:result.token,apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'});
    return {ok:true,account};
  });
  ipcMain.handle('naiAccounts:migrate',()=>{
    const v=getVault(); if(v.list().some(a=>a.id==='legacy-official-v1')) return {migrated:false,message:'旧 Token 已复制，原存储保留。'};
    const data=readStore(); if(!data.token) return {migrated:false,message:'没有可复制的旧 Token。'};
    if(data.settings.apiBaseUrl.replace(/\/+$/,'')!=='https://api.novelai.net'||data.settings.imageBaseUrl.replace(/\/+$/,'')!=='https://image.novelai.net') return {migrated:false,message:'旧凭据使用自定义地址，来源未知；未自动复制到其他主机，请手动确认。'};
    v.add('legacy-official-v1',{label:'原官方账户',method:'token',token:data.token,apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'});
    return {migrated:true,message:'旧 Token 已加密复制；原凭据与设置保留，未自动激活。'};
  });
  ipcMain.handle('naiAccounts:add', (_event, input: NaiAccountInput) => getVault().add(crypto.randomUUID(), input));
  ipcMain.handle('naiAccounts:remove', (_event, id: string) => { if(naiAccountsBusy()) throw Error('账户操作正在执行'); getVault().remove(id); });
  ipcMain.handle('naiAccounts:probe', async (_event, id: string) => {
    const lease = getVault().bind(id);
    try {
      const a = lease.snapshot;
      const relay = a.method === 'relay';
      if (relay) return { status: 0, subscription: 'skipped', protocol: 'unverified',
        message: 'Relay saved as manual NovelAI raw-API profile (/ai/generate-image). Subscription and model probes skipped: no publicly verified read-only endpoint. No network request performed.' };
      const url='https://api.novelai.net/user/subscription';
      const proxy=await proxyConfigForUrl('nai',url,{...getSettings()});
      const response = await axios.get(url, {
        ...proxy,
        headers: { Authorization: `Bearer ${a.token}` }, timeout: 8000, maxRedirects: 0,
        maxContentLength: 256 * 1024, validateStatus: () => true,
      });
      return { status: response.status, subscription: relay ? 'skipped' : response.status === 200 ? 'available' : 'skipped',
        protocol: 'unverified', message: 'GET only; model-list success does not establish NovelAI image protocol support.' };
    } catch { throw new Error('Bounded account GET failed; no retry or endpoint fallback performed'); }
    finally { lease.release(); }
  });
}
