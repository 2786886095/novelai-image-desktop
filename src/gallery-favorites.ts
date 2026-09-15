import type {OnlineGalleryDetail, OnlineGalleryItem, OnlineGallerySourceId} from './online-gallery';
export const GALLERY_FAVORITES_KEY='online-gallery-favorites.v1';
export interface GalleryFavorite {source:OnlineGallerySourceId;id:string;title:string;author:string;sourceUrl:string;prompt:string;negativePrompt:string;createdAt:string;score:number;images:{url:string;thumb:string}[];savedAt:number;}
export type FavoriteSort='newest'|'oldest'|'name'|'name-desc'|'author'|'source'|'score';
export const favoriteKey=(item:Pick<GalleryFavorite,'source'|'id'>)=>`${item.source}:${item.id}`;
export function validGalleryUrl(value:string){try {return ['https:','http:'].includes(new URL(value).protocol)?value:'';}catch{return '';}}
export function parseFavorites(raw:string|null):GalleryFavorite[]{
 if(!raw)return [];const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.items))throw new Error('Invalid favorites library');
 const seen=new Set<string>();return data.items.filter((x:GalleryFavorite)=>{
  if(!x||!['aitag','artist-ranking','danbooru','safebooru','gelbooru','quicktag','tags-gallery'].includes(x.source)||typeof x.id!=='string'||!x.id||typeof x.title!=='string'||!Array.isArray(x.images)||!Number.isFinite(x.savedAt))throw new Error('Invalid favorite');
  const key=favoriteKey(x);if(seen.has(key))return false;seen.add(key);return true;
 }).map((x:GalleryFavorite)=>({...x,author:String(x.author??''),prompt:String(x.prompt??''),negativePrompt:String(x.negativePrompt??''),createdAt:String(x.createdAt??''),score:Number(x.score)||0,sourceUrl:validGalleryUrl(x.sourceUrl),images:x.images.map(i=>({url:validGalleryUrl(i.url),thumb:validGalleryUrl(i.thumb)})).filter(i=>i.url)}));
}
export function changeFavorite(items:GalleryFavorite[],item:GalleryFavorite):GalleryFavorite[]{return items.some(x=>favoriteKey(x)===favoriteKey(item))?items.filter(x=>favoriteKey(x)!==favoriteKey(item)):[item,...items];}
export function orderFavorites(items:GalleryFavorite[],sort:FavoriteSort,language='en-US'){
 const name=new Intl.Collator(language,{numeric:true,sensitivity:'base'});return [...items].sort((a,b)=>{
 let n=sort==='oldest'?a.savedAt-b.savedAt:sort==='name'?name.compare(a.title,b.title):sort==='name-desc'?name.compare(b.title,a.title):sort==='author'?name.compare(a.author,b.author):sort==='source'?name.compare(a.source,b.source):sort==='score'?b.score-a.score:b.savedAt-a.savedAt;
 return n||favoriteKey(a).localeCompare(favoriteKey(b));});
}
export function favoriteFromGallery(item:OnlineGalleryItem,detail?:OnlineGalleryDetail):GalleryFavorite{return {source:item.source,id:item.id,title:item.title,author:item.author,sourceUrl:item.sourceUrl,prompt:detail?.prompt??item.prompt,negativePrompt:detail?.negativePrompt??item.negativePrompt,score:item.score,createdAt:item.createdAt,savedAt:Date.now(),images:(detail?.media.length?detail.media:[item.cover]).map(m=>({url:m.downloadUrl||m.displayUrl,thumb:m.previewUrl||m.displayUrl})).filter(m=>m.url)};}
