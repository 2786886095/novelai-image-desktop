import {describe,it,expect} from 'vitest';
import {activateNaiAccount,currentNaiAccount,naiAccountsBusy,withNaiAccountOperation,naiAccountRevision} from './nai-accounts-runtime';
const a={id:'a',label:'a',method:'relay' as const,token:'fixture-a',apiBaseUrl:'https://a.invalid/prefix',imageBaseUrl:'https://a.invalid/image'};
const b={...a,id:'b',token:'fixture-b',apiBaseUrl:'https://b.invalid',imageBaseUrl:'https://b.invalid'};
describe('atomic account operation scope',()=>{
 it('binds the revision to the selected account and never exposes token in revision',()=>{activateNaiAccount(a,()=>{});const first=naiAccountRevision();expect(first).not.toContain(a.token);activateNaiAccount(b,()=>{});expect(naiAccountRevision()).not.toBe(first);expect(naiAccountRevision()).not.toContain(b.token);activateNaiAccount(undefined,()=>{});});
 it('blocks switching while async generation/stream runs and retains token+hosts',async()=>{activateNaiAccount(a,()=>{});let resolve!:()=>void;const gate=new Promise<void>(r=>resolve=r);const job=withNaiAccountOperation(async()=>{expect(currentNaiAccount()).toEqual(a);await gate;expect(currentNaiAccount()).toEqual(a);});expect(naiAccountsBusy()).toBe(true);expect(()=>activateNaiAccount(b,()=>{})).toThrow();resolve();await job;expect(naiAccountsBusy()).toBe(false);activateNaiAccount(b,()=>{});expect(currentNaiAccount()).toEqual(b);activateNaiAccount(undefined,()=>{});});
 it('does not commit selection on durable write failure',()=>{activateNaiAccount(a,()=>{});expect(()=>activateNaiAccount(b,()=>{throw Error('disk');})).toThrow();expect(currentNaiAccount()).toEqual(a);activateNaiAccount(undefined,()=>{});});
 it('releases busy flag on error',async()=>{await expect(withNaiAccountOperation(()=>{throw Error('fixture');})).rejects.toThrow();expect(naiAccountsBusy()).toBe(false);});
});
