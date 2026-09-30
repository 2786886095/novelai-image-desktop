import {expect,it} from 'vitest';
import {normalizeTabOrder,moveTab,loadTabOrder,saveTabOrder,TAB_ORDER_KEY} from './tab-order';
import {ACTIVE_TABS} from './navigation';
it('repairs old, duplicate and unknown saved tabs without losing new tabs',()=>{
 expect(normalizeTabOrder(['styles','styles','not-a-tab'])).toEqual(['styles',...ACTIVE_TABS.filter(x=>x!=='styles')]);
 expect(normalizeTabOrder(null)).toEqual([...ACTIVE_TABS]);
 expect(normalizeTabOrder(ACTIVE_TABS)).toContain('favorites');
});
it('moves a tab to any position, preserves all identities and saves across reload',()=>{
 const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const moved=moveTab([...ACTIVE_TABS],'styles','generate');expect(moved[0]).toBe('styles');expect(new Set(moved).size).toBe(ACTIVE_TABS.length);
 saveTabOrder(moved,storage);expect(loadTabOrder(storage)).toEqual(moved);expect(moveTab(moved,'unknown','generate')).toEqual(moved);
 data.set(TAB_ORDER_KEY,'{broken');expect(loadTabOrder(storage)).toEqual([...ACTIVE_TABS]);
});
it('surfaces persistence failure rather than claiming it saved',()=>{
 expect(()=>saveTabOrder([...ACTIVE_TABS],{setItem:()=>{throw Error('disk full');}})).toThrow('disk full');
});
