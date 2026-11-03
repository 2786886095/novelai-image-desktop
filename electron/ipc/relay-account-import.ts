import {randomUUID} from 'node:crypto';
import type {NaiAccountInput} from '../../src/nai-accounts';
import {NaiAccountsVault} from './nai-accounts-vault';
import {activateNaiAccount, naiAccountsBusy, withNaiAccountOperation} from './nai-accounts-runtime';
import {rememberRelaySecret} from '../relay-import-redaction';

export const RELAY_ORIGIN = 'https://nai.langbai.cc';
export const RELAY_EXCHANGE = RELAY_ORIGIN + '/api/workbench/import/exchange';
export const RELAY_ACCOUNT_NAME = 'Langbai Novelai生图';
export type RelayImportNotice = {id:string;status:'imported'|'saved-busy'|'invalid-link'|'unavailable'|'failed';selected:boolean;reused?:boolean;balanceRefreshed?:boolean};

/** Deliberately exact syntax. No alternative hosts, extra parameters or embedded keys. */
export function relayImportCode(value:unknown):string|undefined {
  return typeof value==='string' ? /^langbai-novelai:\/\/relay\/import\?code=([A-Za-z0-9_-]{43})$/.exec(value)?.[1] : undefined;
}

export function parseRelayExchange(value:unknown):NaiAccountInput {
  const fail=()=>{throw new Error('Invalid relay exchange response');};
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  const x=value as Record<string,unknown>;
  if(x.version!==1||x.type!=='novelai-relay'||x.name!==RELAY_ACCOUNT_NAME||
    typeof x.apiToken!=='string'||!x.apiToken.trim()||x.apiToken!==x.apiToken.trim()||x.apiToken.length>16384||/[\x00-\x20\x7f]/.test(x.apiToken))return fail();
  for(const field of ['apiUrl','imageApiUrl']) {
    if(x[field]!==RELAY_ORIGIN&&x[field]!==RELAY_ORIGIN+'/')return fail();
  }
  rememberRelaySecret(x.apiToken);
  return {label:RELAY_ACCOUNT_NAME,method:'relay',apiBaseUrl:RELAY_ORIGIN,imageBaseUrl:RELAY_ORIGIN,token:x.apiToken};
}

/** Exactly one POST. No cookies, provider authorization, redirect, response-body error or retry. */
export async function exchangeRelayCode(code:string,request:typeof fetch=fetch):Promise<NaiAccountInput> {
  if(!/^[A-Za-z0-9_-]{43}$/.test(code))throw new Error('Invalid import code');
  const response=await request(RELAY_EXCHANGE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({code}),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});
  if(!response.ok) { await response.body?.cancel(); throw new Error(response.status===404||response.status===501||response.status===503?'Relay exchange unavailable':'Relay exchange failed'); }
  if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw new Error('Relay exchange unavailable');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Relay exchange failed');
  const chunks:Uint8Array[]=[];let total=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>65536)throw new Error('Invalid relay exchange response');chunks.push(value);} }
  finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  let data:unknown;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('Invalid relay exchange response');}
  return parseRelayExchange(data);
}

/** Main-process write/switch boundary; adding an account does not mutate a running job's snapshot. */
export async function saveRelayAccount(vault:NaiAccountsVault,input:NaiAccountInput,extraBusy:()=>boolean,refresh:()=>Promise<unknown>):Promise<RelayImportNotice> {
  const names=new Set(vault.list().map(a=>a.label));let label=RELAY_ACCOUNT_NAME,n=0;while(names.has(label))label=RELAY_ACCOUNT_NAME+(++n);
  const existing=vault.findByEndpointAndToken(input);
  const account=existing??vault.add(randomUUID(),{...input,label});
  if(vault.hasActiveLeases()||naiAccountsBusy()||extraBusy())return {id:randomUUID(),status:'saved-busy',selected:false,reused:!!existing};
  const lease=vault.bind(account.id);const snapshot=lease.snapshot;lease.release();
  // No await between the final main-process busy check and the durable select.
  if(vault.hasActiveLeases()||naiAccountsBusy()||extraBusy())return {id:randomUUID(),status:'saved-busy',selected:false,reused:!!existing};
  activateNaiAccount(snapshot,()=>vault.select(account.id));
  let balanceRefreshed=false;
  try {await withNaiAccountOperation(async()=>{const summary=await refresh() as {stale?:boolean};balanceRefreshed=summary?.stale!==true;});}catch{/* Saved and selected; balance unavailable is not an import failure. */}
  return {id:randomUUID(),status:'imported',selected:true,reused:!!existing,balanceRefreshed};
}
