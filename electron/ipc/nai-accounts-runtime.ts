import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';
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
