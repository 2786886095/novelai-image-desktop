import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';
import type { AccountSummary } from '../../src/types';
import {stableNaiAccountSummary,type NaiAccountSummary} from './nai-account-summary';
import type { NaiAccountProfile } from '../../src/nai-accounts';
export type NaiAccountSnapshot = Readonly<NaiAccountProfile & { token: string }>;
interface LegacyBinding { token?:string; apiBaseUrl:string; imageBaseUrl:string; allowCustomEndpoint:boolean; allowCustomEndpointFallback:boolean }
const contexts = new AsyncLocalStorage<{ snapshot: NaiAccountSnapshot | undefined; legacy?: LegacyBinding }>();
let legacyProvider: (()=>LegacyBinding) | undefined;
export function configureLegacyNaiBinding(provider:()=>LegacyBinding) { legacyProvider=provider; }
export function boundLegacyNaiAccount() { return contexts.getStore()?.legacy; }
let active: NaiAccountSnapshot | undefined;
let managed=false;
export function legacyNaiBindingAllowed(){const context=contexts.getStore();return context?!!context.legacy:!managed;}
let operations=0;
const revisionKey=randomBytes(32);
const proposals=new Map<string,string>();
export function naiAccountRevision() {
  const selected=currentNaiAccount(); const legacy=boundLegacyNaiAccount() ?? (legacyNaiBindingAllowed()?legacyProvider?.():undefined);
  return createHmac('sha256',revisionKey).update(JSON.stringify(selected ? [selected.id,selected.token,selected.apiBaseUrl,selected.imageBaseUrl] : [legacy?'legacy':'signed-out',legacy])).digest('hex');
}
export function rememberNaiProposal(conversationId:string,messageId:string) { proposals.set(JSON.stringify([conversationId,messageId]),naiAccountRevision()); }
export function assertNaiProposalAccount(conversationId:string,messageId:string) {
  if(proposals.get(JSON.stringify([conversationId,messageId]))!==naiAccountRevision()) throw Error('生成方案所属账户未确认或已切换；未提交，请重新生成方案。');
}
export function currentNaiAccount() { const context=contexts.getStore(); return context ? context.snapshot : active; }
export function naiAccountsBusy() { return operations > 0; }
export function activateNaiAccount(snapshot: NaiAccountSnapshot | undefined, persist: () => void) {
  if (operations) throw new Error('账户操作正在执行；不能切换账户。');
  persist(); managed=true; active=snapshot ? Object.freeze({...snapshot}) : undefined;
}
export function restoreNaiAccount(snapshot: NaiAccountSnapshot|undefined, accountManaged=true) { managed=accountManaged; active=snapshot?Object.freeze({...snapshot}):undefined; }
export async function withNaiAccountOperation<T>(callback: () => T | Promise<T>): Promise<T> {
  const snapshot=currentNaiAccount(); const legacy=snapshot||!legacyNaiBindingAllowed()?undefined:{...(boundLegacyNaiAccount() ?? legacyProvider?.())}; operations++;
  try { return await contexts.run({snapshot,legacy:legacy as LegacyBinding|undefined},callback); }
  finally { operations--; }
}

const summaries=new Map<string,NaiAccountSummary>();
let summaryStorage:{read:(id:string)=>NaiAccountSummary|undefined;write:(id:string,value:NaiAccountSummary)=>void}|undefined;
export function configureNaiAccountSummaries(storage:NonNullable<typeof summaryStorage>){summaryStorage=storage;summaries.clear();}
function summaryKey(snapshot:NaiAccountSnapshot){return createHmac('sha256',revisionKey).update(JSON.stringify([snapshot.id,snapshot.token,snapshot.apiBaseUrl,snapshot.imageBaseUrl])).digest('hex');}
export function getNaiAccountSummary(snapshot=currentNaiAccount()):AccountSummary {
  if(!snapshot)return {hasToken:false};
  const key=summaryKey(snapshot),fresh=summaries.get(key);
  const cached=fresh??summaryStorage?.read(snapshot.id);
  return {...cached,hasToken:true,accountId:snapshot.id,stale:fresh?fresh.stale===true:true};
}
export function rememberNaiAccountSummary(snapshot:NaiAccountSnapshot,summary:NaiAccountSummary){
  const previous=getNaiAccountSummary(snapshot),stable=stableNaiAccountSummary(summary);
  const known=stable.anlasBalance!==undefined;
  const merged={...stable,anlasBalance:known?stable.anlasBalance:previous.anlasBalance,stale:!known,
    opusUsage:summary.opusUsage,opusUsageUpdatedAt:summary.opusUsageUpdatedAt};
  summaryStorage?.write(snapshot.id,merged);summaries.set(summaryKey(snapshot),merged);
}
export function forgetNaiAccountSummary(id:string){
  // Clearing all ephemeral metadata on deletion is cheap and avoids retaining a removed identity.
  summaries.clear();
}
