import type {ImageFavorite} from './favorites-types';

export const FAVORITES_VIEW_KEY='langbai.favorites.view.v1';
export const FAVORITES_PAGE_SIZES=[12,24,48,96] as const;
export type FavoritesView={pageSize:number;layout:'grid'|'masonry';sortBy:'savedAt'|'generatedAt';sortDirection:'desc'|'asc'};
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
function browserStorage():StoragePort|undefined{try{return globalThis.localStorage;}catch{return undefined;}}
export function normalizeFavoritesView(value:unknown):FavoritesView{
 const input=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {pageSize:FAVORITES_PAGE_SIZES.includes(input.pageSize as 12)?Number(input.pageSize):24,layout:input.layout==='masonry'?'masonry':'grid',sortBy:input.sortBy==='generatedAt'?'generatedAt':'savedAt',sortDirection:input.sortDirection==='asc'?'asc':'desc'};
}
export function loadFavoritesView(storage:StoragePort|undefined=browserStorage()):FavoritesView{
 try{return normalizeFavoritesView(JSON.parse(storage?.getItem(FAVORITES_VIEW_KEY)||'null'));}catch{return normalizeFavoritesView(null);}
}
export function saveFavoritesView(value:Partial<FavoritesView>,storage:StoragePort|undefined=browserStorage()):FavoritesView{
 if(!storage)throw new Error('Favorites view storage is unavailable');
 // Older layout/page-size callers must not erase a separately chosen sort.
 // One complete JSON write keeps all four preferences in the same record.
 const patch=Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!==undefined));
 const next=normalizeFavoritesView({...loadFavoritesView(storage),...patch});
 storage.setItem(FAVORITES_VIEW_KEY,JSON.stringify(next));return next;
}
/** Canonical ISO instants only; invalid calendar dates must not roll forward. */
export function favoriteSortTimestamp(value:unknown):number|null{
 if(typeof value!=='string')return null;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!match)return null;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||Number(match[4])>23||Number(match[5])>59||Number(match[6])>59)return null;
 if(match[7]!=='Z'&&(Number(match[7].slice(1,3))>23||Number(match[7].slice(4,6))>59))return null;
 const time=Date.parse(value);return Number.isFinite(time)?time:null;
}
const compareText=(left:string,right:string):number=>left<right?-1:left>right?1:0;
/** Sorting never changes library items; unknown times are last in both directions. */
export function sortFavoriteItems(items:readonly ImageFavorite[],view:Pick<FavoritesView,'sortBy'|'sortDirection'>):ImageFavorite[]{
 const direction=view.sortDirection==='asc'?1:-1,key=view.sortBy==='generatedAt'?'generatedAt':'savedAt';
 return items.map((item,index)=>({item,index,time:favoriteSortTimestamp(item[key])})).sort((a,b)=>{
  if(a.time===null&&b.time!==null)return 1;
  if(a.time!==null&&b.time===null)return -1;
  if(a.time!==null&&b.time!==null&&a.time!==b.time)return direction*(a.time-b.time);
  return compareText(a.item.id,b.item.id)||compareText(a.item.filePath,b.item.filePath)||a.index-b.index;
 }).map(({item})=>item);
}
export function favoritePreviewItems(items:ImageFavorite[]):ImageFavorite[]{return items.filter(x=>!x.missing&&!!x.fileUrl);}
