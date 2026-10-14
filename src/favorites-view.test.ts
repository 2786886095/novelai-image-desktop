import {afterEach,expect,it,vi} from 'vitest';
import {FAVORITES_VIEW_KEY,normalizeFavoritesView,loadFavoritesView,saveFavoritesView,favoritePreviewItems,favoriteSortTimestamp,sortFavoriteItems} from './favorites-view';
import type {ImageFavorite} from './favorites-types';
const defaults={pageSize:24,layout:'grid',sortBy:'savedAt',sortDirection:'desc'} as const;
afterEach(()=>vi.unstubAllGlobals());
it('bounds pagination and layout without trusting persisted values',()=>{
 for(const invalid of [null,[],{pageSize:0},{pageSize:Infinity},{pageSize:'96',layout:'unknown'}])expect(normalizeFavoritesView(invalid)).toEqual(defaults);
 for(const pageSize of [12,24,48,96])expect(normalizeFavoritesView({pageSize,layout:'masonry'})).toEqual({...defaults,pageSize,layout:'masonry'});
 expect(normalizeFavoritesView({sortBy:'generatedAt',sortDirection:'asc'})).toEqual({...defaults,sortBy:'generatedAt',sortDirection:'asc'});
 expect(normalizeFavoritesView({sortBy:'mtime',sortDirection:'sideways'})).toEqual(defaults);
});
it('persists selection across remounts without touching other settings',()=>{
 const values=new Map([['other','retained']]),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 saveFavoritesView({pageSize:48,layout:'masonry'},store);
 expect(loadFavoritesView(store)).toEqual({...defaults,pageSize:48,layout:'masonry'});expect(values.get('other')).toBe('retained');
 values.set(FAVORITES_VIEW_KEY,'broken');expect(loadFavoritesView(store)).toEqual(defaults);
});
it('migrates legacy layout preferences and keeps sort during legacy partial updates',()=>{
 const values=new Map([[FAVORITES_VIEW_KEY,JSON.stringify({pageSize:12,layout:'masonry'})]]),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 expect(loadFavoritesView(store)).toEqual({...defaults,pageSize:12,layout:'masonry'});
 saveFavoritesView({sortBy:'generatedAt',sortDirection:'asc'},store);
 saveFavoritesView({layout:'grid',pageSize:48},store);
 expect(loadFavoritesView(store)).toEqual({pageSize:48,layout:'grid',sortBy:'generatedAt',sortDirection:'asc'});
 expect(Object.keys(JSON.parse(values.get(FAVORITES_VIEW_KEY)!)).sort()).toEqual(['layout','pageSize','sortBy','sortDirection']);
});
it('reports persistence failure instead of pretending preferences were saved',()=>{
 expect(()=>saveFavoritesView({pageSize:96,layout:'grid'},{getItem:()=>null,setItem:()=>{throw Error('disk full');}})).toThrow('disk full');
});
it('contains global localStorage getter/read failures and reports unavailable writes',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('getter denied');}});
 try{expect(loadFavoritesView()).toEqual(defaults);expect(()=>saveFavoritesView({sortBy:'generatedAt'})).toThrow('storage is unavailable');}
 finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}
 expect(loadFavoritesView({getItem:()=>{throw Error('read denied');},setItem:()=>{}})).toEqual(defaults);
});
it('accepts only finite ISO instants rather than durations or normalized invalid dates',()=>{
 for(const invalid of [undefined,null,'123','2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','2026-10-14T24:00:00Z','2026-10-14T00:00:00','bad'])expect(favoriteSortTimestamp(invalid)).toBeNull();
 expect(favoriteSortTimestamp('2024-02-29T00:00:00Z')).toBe(Date.parse('2024-02-29T00:00:00Z'));
 expect(favoriteSortTimestamp('2026-10-14T08:00:00+08:00')).toBe(favoriteSortTimestamp('2026-10-14T00:00:00.000Z'));
});
it('sorts copies with deterministic ties and unknown generation time always last',()=>{
 const items=[{id:'b',filePath:'b',generatedAt:'2026-10-14T00:00:00Z',savedAt:'2026-10-14T03:00:00Z'},{id:'x',filePath:'x',savedAt:'2026-10-14T04:00:00Z'},{id:'a',filePath:'a',generatedAt:'2026-10-14T00:00:00Z',savedAt:'2026-10-14T01:00:00Z'},{id:'c',filePath:'c',generatedAt:'2026-10-14T02:00:00Z',savedAt:'2026-10-14T02:00:00Z'}] as ImageFavorite[];
 expect(sortFavoriteItems(items,{sortBy:'generatedAt',sortDirection:'desc'}).map(x=>x.id)).toEqual(['c','a','b','x']);
 expect(sortFavoriteItems(items,{sortBy:'generatedAt',sortDirection:'asc'}).map(x=>x.id)).toEqual(['a','b','c','x']);
 expect(sortFavoriteItems(items,{sortBy:'savedAt',sortDirection:'desc'}).map(x=>x.id)).toEqual(['x','b','c','a']);
 expect(items.map(x=>x.id)).toEqual(['b','x','a','c']);
});
it('preview respects filtered ordering and skips unavailable originals',()=>{
 const items=[{id:'a',fileUrl:'a'},{id:'b',missing:true,fileUrl:'b'},{id:'c'},{id:'d',fileUrl:'d'}] as ImageFavorite[];
 expect(favoritePreviewItems(items).map(x=>x.id)).toEqual(['a','d']);expect(items).toHaveLength(4);
});
