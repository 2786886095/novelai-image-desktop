import {ACTIVE_TABS,isActiveTab,type ActiveTab} from '../app/navigation';
import {loadTabOrder,saveTabOrder} from '../app/tab-order';
import {GALLERY_FAVORITES_KEY,parseFavorites,type GalleryFavorite} from '../gallery-favorites';
import {collectionGroup,validateCollectionAction} from './collection-contract';
import {loadFavoritesView,saveFavoritesView,type FavoritesView} from '../favorites-view';
export function createRendererCollections(deps:{storage:Pick<Storage,'getItem'|'setItem'>;getTab:()=>ActiveTab;setTab:(tab:ActiveTab)=>void;changed:(group:string)=>void}){
 const nonce=crypto.randomUUID(),revisions=new Map<string,{fingerprint:string;value:string}>();let count=0;
 function read(group:string):{revision:string;items?:GalleryFavorite[];order?:ActiveTab[];active?:ActiveTab;available?:readonly ActiveTab[];view?:FavoritesView}{
  if(!['navigation','favorites.online','favorites.view'].includes(group))throw Error('未知界面集合');
  const state=group==='navigation'?{order:loadTabOrder(deps.storage),active:deps.getTab(),available:ACTIVE_TABS}:group==='favorites.view'?{view:loadFavoritesView(deps.storage)}:{items:parseFavorites(deps.storage.getItem(GALLERY_FAVORITES_KEY))};
  const fingerprint=JSON.stringify(state);let entry=revisions.get(group);if(!entry||entry.fingerprint!==fingerprint){entry={fingerprint,value:`${nonce}:${++count}`};revisions.set(group,entry);}
  return {...state,revision:entry.value};
 }
 function apply(args:Record<string,unknown>){
  const spec=validateCollectionAction(args),group=collectionGroup(spec.action),before=read(group);
  if(spec.effect==='read')return before;
  if(args.expectedRevision!==before.revision)throw Error('界面资料已变化，请重新读取');
  if(spec.action==='navigation.setOrder'){
   const order=args.order as string[];
   if(order.length!==ACTIVE_TABS.length||new Set(order).size!==ACTIVE_TABS.length||order.some(x=>!isActiveTab(x)))throw Error('必须保留全部功能，每项仅出现一次');
   saveTabOrder(order,deps.storage);
  }else if(spec.action==='navigation.reset')saveTabOrder(ACTIVE_TABS,deps.storage);
  else if(spec.action==='navigation.select'){if(!isActiveTab(args.id))throw Error('页面不存在');deps.setTab(args.id);}
  else if(spec.action==='favorites.view.update')saveFavoritesView({layout:args.layout as FavoritesView['layout'],pageSize:args.pageSize as number},deps.storage);
  else {
   let items=before.items!;
   if(spec.action==='favorites.online.add'){
    const item=args.item as Record<string,unknown>;
    const fields=['source','id','title','author','sourceUrl','prompt','negativePrompt','createdAt','score','images'];
    const clean=Object.fromEntries(fields.filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));
    clean.savedAt=Date.now();if(!Array.isArray(clean.images)||clean.images.length>100)throw Error('images 必须是最多100项的链接列表');
    const candidate=parseFavorites(JSON.stringify({version:1,items:[clean]}))[0];
    if(candidate.id.length>200||candidate.title.length>500)throw Error('书签名称或ID过长');
    if(items.some(x=>x.source===candidate.source&&x.id===candidate.id))return before;
    items=[candidate,...items];
   }else if(spec.action==='favorites.online.remove'){
    if(!items.some(x=>`${x.source}:${x.id}`===args.id))throw Error('书签不存在');items=items.filter(x=>`${x.source}:${x.id}`!==args.id);
   }else throw Error('未接通该界面操作');
   deps.storage.setItem(GALLERY_FAVORITES_KEY,JSON.stringify({version:1,items}));
  }
  const after=read(group);deps.changed(group);return after;
 }
 return {read,apply};
}
