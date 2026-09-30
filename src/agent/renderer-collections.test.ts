import {expect,it} from 'vitest';
import {createRendererCollections} from './renderer-collections';
import {ACTIVE_TABS,type ActiveTab} from '../app/navigation';
import {GALLERY_FAVORITES_KEY} from '../gallery-favorites';
import {TAB_ORDER_KEY} from '../app/tab-order';
import {FAVORITES_VIEW_KEY} from '../favorites-view';
function fixture(){const values=new Map<string,string>();let tab:ActiveTab='generate';const events:string[]=[];const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};const create=()=>createRendererCollections({storage,getTab:()=>tab,setTab:v=>{tab=v;},changed:v=>events.push(v)});return {values,storage,create,events,get tab(){return tab;}};}
const item={source:'danbooru',id:'123',title:'fixture',author:'',sourceUrl:'https://danbooru.donmai.us/posts/123',prompt:'test',negativePrompt:'',createdAt:'',score:0,savedAt:1,images:[]};
it('Agent browsing preferences use actual persisted fields and reject invalid or stale settings',()=>{
 const f=fixture(),api=f.create(),state=api.read('favorites.view');
 const after=api.apply({action:'favorites.view.update',layout:'masonry',pageSize:48,expectedRevision:state.revision});
 expect(after.view).toEqual({layout:'masonry',pageSize:48});expect(f.create().read('favorites.view').view).toEqual(after.view);expect(f.events).toContain('favorites.view');
 expect(()=>api.apply({action:'favorites.view.update',layout:'masonry',pageSize:0,expectedRevision:after.revision})).toThrow();
 f.values.set(FAVORITES_VIEW_KEY,JSON.stringify({pageSize:12,layout:'grid'}));expect(()=>api.apply({action:'favorites.view.update',layout:'masonry',pageSize:24,expectedRevision:after.revision})).toThrow('已变化');
});
it('navigation changes use the same persisted order and notify the live tab bar',()=>{
 const f=fixture(),api=f.create(),state=api.read('navigation');const order=[...ACTIVE_TABS].reverse();
 const after=api.apply({action:'navigation.setOrder',order,expectedRevision:state.revision});expect(after.order).toEqual(order);expect(JSON.parse(f.values.get(TAB_ORDER_KEY)!)).toEqual(order);expect(f.events).toContain('navigation');expect(f.create().read('navigation').order).toEqual(order);
 const selected=api.apply({action:'navigation.select',id:'favorites',expectedRevision:after.revision});expect(f.tab).toBe('favorites');expect(selected.active).toBe('favorites');
 const reset=api.apply({action:'navigation.reset',expectedRevision:selected.revision});expect(reset.order).toEqual([...ACTIVE_TABS]);
});
it('rejects incomplete/duplicated order and stale changes rather than silently dropping tabs',()=>{
 const f=fixture(),api=f.create(),state=api.read('navigation');
 for(const order of [['generate'],[...ACTIVE_TABS,'generate'],[...ACTIVE_TABS.slice(1),'unknown']])expect(()=>api.apply({action:'navigation.setOrder',order,expectedRevision:state.revision})).toThrow();
 f.values.set(TAB_ORDER_KEY,JSON.stringify([...ACTIVE_TABS].reverse()));expect(()=>api.apply({action:'navigation.select',id:'favorites',expectedRevision:state.revision})).toThrow();expect(f.tab).toBe('generate');
});
it('online bookmarks are idempotent, persistent, separate from local originals and notify their UI',()=>{
 const f=fixture(),api=f.create(),state=api.read('favorites.online');f.values.set('unrelated','preserved');
 const added=api.apply({action:'favorites.online.add',item,expectedRevision:state.revision});expect(added.items).toHaveLength(1);expect(f.events).toContain('favorites.online');
 const duplicate=api.apply({action:'favorites.online.add',item,expectedRevision:added.revision});expect(duplicate.items).toHaveLength(1);expect(f.create().read('favorites.online').items).toHaveLength(1);
 const removed=api.apply({action:'favorites.online.remove',id:'danbooru:123',expectedRevision:duplicate.revision});expect(removed.items).toEqual([]);expect(f.values.get('unrelated')).toBe('preserved');
});
it('corrupt storage and persistence failures leave original bookmarks intact',()=>{
 const f=fixture(),api=f.create();f.values.set(GALLERY_FAVORITES_KEY,'{bad');expect(()=>api.read('favorites.online')).toThrow();expect(f.values.get(GALLERY_FAVORITES_KEY)).toBe('{bad');
 f.values.delete(GALLERY_FAVORITES_KEY);const state=api.read('favorites.online');f.storage.setItem=()=>{throw Error('quota');};expect(()=>api.apply({action:'favorites.online.add',item,expectedRevision:state.revision})).toThrow('quota');expect(f.events).toEqual([]);
});
