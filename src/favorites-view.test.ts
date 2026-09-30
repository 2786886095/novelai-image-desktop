import {expect,it} from 'vitest';
import {FAVORITES_VIEW_KEY,normalizeFavoritesView,loadFavoritesView,saveFavoritesView,favoritePreviewItems} from './favorites-view';
import type {ImageFavorite} from './favorites-types';
it('bounds pagination and layout without trusting persisted values',()=>{
 for(const invalid of [null,[],{pageSize:0},{pageSize:Infinity},{pageSize:'96',layout:'unknown'}])expect(normalizeFavoritesView(invalid)).toEqual({pageSize:24,layout:'grid'});
 for(const pageSize of [12,24,48,96])expect(normalizeFavoritesView({pageSize,layout:'masonry'})).toEqual({pageSize,layout:'masonry'});
});
it('persists selection across remounts without touching other settings',()=>{
 const values=new Map([['other','retained']]),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 saveFavoritesView({pageSize:48,layout:'masonry'},store);
 expect(loadFavoritesView(store)).toEqual({pageSize:48,layout:'masonry'});expect(values.get('other')).toBe('retained');
 values.set(FAVORITES_VIEW_KEY,'broken');expect(loadFavoritesView(store)).toEqual({pageSize:24,layout:'grid'});
});
it('reports persistence failure instead of pretending preferences were saved',()=>{
 expect(()=>saveFavoritesView({pageSize:96,layout:'grid'},{getItem:()=>null,setItem:()=>{throw Error('disk full');}})).toThrow('disk full');
});
it('preview respects filtered ordering and skips unavailable originals',()=>{
 const items=[{id:'a',fileUrl:'a'},{id:'b',missing:true,fileUrl:'b'},{id:'c'},{id:'d',fileUrl:'d'}] as ImageFavorite[];
 expect(favoritePreviewItems(items).map(x=>x.id)).toEqual(['a','d']);expect(items).toHaveLength(4);
});
