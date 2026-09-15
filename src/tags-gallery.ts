import type {OnlineGalleryItem,OnlineGalleryPage,OnlineGalleryDetail} from './online-gallery';
import {emptyOnlineGalleryTagGroups} from './online-gallery';

export const TAGS_GALLERY_ORIGIN='https://tags.gallery';
export const TAGS_GALLERY_CATEGORIES=['artist','character','copyright','fashion_style','face','face_parts','hair','accessories','composition'] as const;
export type TagsGalleryCategory=typeof TAGS_GALLERY_CATEGORIES[number];
export function tagsGalleryLabels(language:unknown){
 const labels:Record<string,string[]>={
 'zh-CN':['画师','角色','作品','服装风格','面容','五官','发型','配饰','构图'],
 'zh-TW':['畫師','角色','作品','服裝風格','面容','五官','髮型','配飾','構圖'],
 'en-US':['Artists','Characters','Series','Fashion','Faces','Facial features','Hair','Accessories','Composition'],
 'ja-JP':['絵師','キャラ','作品','服','顔','顔パーツ','髪','小物','構図'],
 'ko-KR':['작가','캐릭터','작품','패션','얼굴','얼굴 특징','머리','액세서리','구도']};
 return TAGS_GALLERY_CATEGORIES.map((value,i)=>({value,label:(labels[String(language)]??labels['en-US'])[i]}));
}
export function tagsGalleryCategory(value:unknown):TagsGalleryCategory{
 if(value==null||value==='')return 'artist';
 if(TAGS_GALLERY_CATEGORIES.includes(value as TagsGalleryCategory))return value as TagsGalleryCategory;
 throw new Error('TAGS_GALLERY_INVALID_CATEGORY');
}
function decodeHtml(value:string){return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(_,key:string)=>{
 if(key[0]==='#'){const n=parseInt(key.slice(key[1].toLowerCase()==='x'?2:1),key[1].toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[key.toLowerCase()]??'';
});}
function attributes(raw:string){return Object.fromEntries([...raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),decodeHtml(m[2]??m[3]??'')]));}
function htmlBody(raw:string){if(raw.length>5_000_000)throw new Error('TAGS_GALLERY_RESPONSE_TOO_LARGE');return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');}
function imageUrl(raw:string){if(!raw)return '';const u=new URL(raw,TAGS_GALLERY_ORIGIN);return u.origin===TAGS_GALLERY_ORIGIN&&u.pathname.startsWith('/images/')?u.toString():'';}
function media(raw:string,id:string){const img=attributes(raw.match(/<img\b([^>]*)>/i)?.[1]??'');const source=attributes(raw.match(/<source\b([^>]*)>/i)?.[1]??'');const url=imageUrl(img.src??'');return {id,previewUrl:imageUrl(source.srcset?.split(/\s|,/)[0]??'')||url,displayUrl:url,downloadUrl:url,width:Number(img.width)||0,height:Number(img.height)||0,extension:'webp'};}
export function tagsGalleryItem(id:string,title:string,cover:ReturnType<typeof media>):OnlineGalleryItem{
 const category=tagsGalleryCategory(id.split('/')[0]);const tags=emptyOnlineGalleryTagGroups();
 if(category==='artist')tags.artists=[title];else if(category==='character')tags.characters=[title];else if(category==='copyright')tags.copyrights=[title];else tags.general=[title];
 return {source:'tags-gallery',id,kind:'work',title,author:category==='artist'?title:'',description:title,createdAt:'',rating:'',score:0,favoriteCount:0,viewCount:0,mediaCount:cover.displayUrl?1:0,prompt:title,negativePrompt:'',tags,cover,sourceUrl:`${TAGS_GALLERY_ORIGIN}/${id}`};
}
export function parseTagsGalleryPage(raw:string,category:TagsGalleryCategory){
 const html=htmlBody(raw);const plain=decodeHtml(html.replace(/<[^>]*>/g,' '));
 const count=plain.match(/hits=\s*([\d,]+)/)?.[1];if(count==null)throw new Error('TAGS_GALLERY_LAYOUT_CHANGED');
 const total=Number(count.replaceAll(',',''));const items:OnlineGalleryItem[]=[];
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const attrs=attributes(m[1]);if(!attrs['aria-label']?.startsWith('Open detail: '))continue;
  const href=attrs.href??'';if(!href.startsWith(`/${category}/`)||href.includes('?')||href.includes('#'))continue;
  const id=href.slice(1);const title=attrs['aria-label'].slice('Open detail: '.length);items.push(tagsGalleryItem(id,title,media(m[2],id)));
 }
 if(total>0&&!items.length)throw new Error('TAGS_GALLERY_LAYOUT_CHANGED');
 return {total,items};
}
export function tagsGalleryUrl(category:TagsGalleryCategory,page:number,query:string,sort='score'){const u=new URL(category==='artist'?'/v4-5':`/v4-5/${category}`,TAGS_GALLERY_ORIGIN);if(page>1)u.searchParams.set('p',String(page));if(query)u.searchParams.set('q',query);if(!['score','count','name'].includes(sort))throw new Error('TAGS_GALLERY_INVALID_SORT');if(sort!=='score')u.searchParams.set('s',sort);return u.toString();}
export async function loadTagsGalleryPage(fetchHtml:(url:string)=>Promise<string>,category:TagsGalleryCategory,page=1,pageSize=12,query='',sort='score'):Promise<OnlineGalleryPage>{
 if(!Number.isInteger(page)||page<1||page>100000)throw new Error('TAGS_GALLERY_INVALID_PAGE');
 const size=[12,24,48,60].includes(pageSize)?pageSize:12;const offset=(page-1)*size;const first=Math.floor(offset/100)+1;
 const raw=await fetchHtml(tagsGalleryUrl(category,first,query,sort));const start=parseTagsGalleryPage(raw,category);
 let items=start.items.slice(offset%100,offset%100+size);
 if(items.length<size&&offset+items.length<start.total){const next=parseTagsGalleryPage(await fetchHtml(tagsGalleryUrl(category,first+1,query,sort)),category);items=items.concat(next.items.slice(0,size-items.length));}
 return {source:'tags-gallery',page,pageSize:size,total:start.total,items,hasMore:offset+items.length<start.total};
}
export function tagsGalleryDetailUrl(id:string){const slash=id.indexOf('/');tagsGalleryCategory(id.slice(0,slash));if(slash<1||!id.slice(slash+1)||id.slice(slash+1).includes('/')||/[?#\\]/.test(id)||decodeURIComponent(id).includes('..'))throw new Error('TAGS_GALLERY_INVALID_ID');return `${TAGS_GALLERY_ORIGIN}/${id}`;}
export function parseTagsGalleryDetail(raw:string,id:string):OnlineGalleryDetail{
 tagsGalleryDetailUrl(id);const html=htmlBody(raw);const copies=[...html.matchAll(/<button\b([^>]*)>/gi)].map(m=>attributes(m[1])['aria-label']??'').filter(s=>s.startsWith('Copy tag: ')).map(s=>s.slice(10));
 if(!copies.length)throw new Error('TAGS_GALLERY_LAYOUT_CHANGED');
 const tag=copies[0];const cover=media(html,id);const item=tagsGalleryItem(id,tag,cover);
 return {item,media:cover.displayUrl?[cover]:[],prompt:copies.at(-1)??tag,negativePrompt:'',note:'',categoryPath:[id.split('/')[0]],metadata:{sourceUrl:item.sourceUrl,model:'NAI Diffusion Anime V4.5 Full'}};
}

export function tagsGalleryUi(language:unknown){
 const [category,pending]=({
 'zh-CN':['分类','官网尚未提供样例图'], 'zh-TW':['分類','官網尚未提供範例圖'],
 'en-US':['Category','No sample image provided by the source'], 'ja-JP':['カテゴリ','元サイトにサンプル画像がありません'],
 'ko-KR':['카테고리','원본 사이트에 샘플 이미지가 없습니다']
 } as Record<string,string[]>)[String(language)]??['Category','No sample image provided by the source'];return {category,pending};
}
