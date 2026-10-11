import type {ImageFavorite} from './favorites-types';

export const FAVORITES_VIEW_KEY='langbai.favorites.view.v1';
export const FAVORITES_PAGE_SIZES=[12,24,48,96] as const;
export type FavoritesView={pageSize:number;layout:'grid'|'masonry'};
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
export function normalizeFavoritesView(value:unknown):FavoritesView{
 const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {pageSize:FAVORITES_PAGE_SIZES.includes(input.pageSize as 12)?Number(input.pageSize):24,layout:input.layout==='masonry'?'masonry':'grid'};
}
export function loadFavoritesView(storage:StoragePort=localStorage):FavoritesView{
 try{return normalizeFavoritesView(JSON.parse(storage.getItem(FAVORITES_VIEW_KEY)||'null'));}catch{return normalizeFavoritesView(null);}
}
export function saveFavoritesView(value:FavoritesView,storage:StoragePort=localStorage):FavoritesView{
 const next=normalizeFavoritesView(value);storage.setItem(FAVORITES_VIEW_KEY,JSON.stringify(next));return next;
}
export function favoritePreviewItems(items:ImageFavorite[]):ImageFavorite[]{return items.filter(x=>!x.missing&&!!x.fileUrl);}
