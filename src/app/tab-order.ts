import {ACTIVE_TABS,type ActiveTab} from './navigation';
export const TAB_ORDER_KEY='langbai.navigation.order.v1';
export function normalizeTabOrder(value:unknown):ActiveTab[]{
 const allowed=new Set<string>(ACTIVE_TABS),seen=new Set<string>();
 return [...(Array.isArray(value)?value:[]),...ACTIVE_TABS].filter((x):x is ActiveTab=>typeof x==='string'&&allowed.has(x)&&!seen.has(x)&&Boolean(seen.add(x)));
}
export function loadTabOrder(storage:Pick<Storage,'getItem'>=localStorage){try{return normalizeTabOrder(JSON.parse(storage.getItem(TAB_ORDER_KEY)??'null'));}catch{return normalizeTabOrder(null);}}
export function saveTabOrder(order:readonly string[],storage:Pick<Storage,'setItem'>=localStorage){storage.setItem(TAB_ORDER_KEY,JSON.stringify(normalizeTabOrder(order)));}
export function moveTab(order:readonly ActiveTab[],from:string,to:string):ActiveTab[]{
 const next=[...order],start=next.indexOf(from as ActiveTab),end=next.indexOf(to as ActiveTab);
 if(start<0||end<0||start===end)return next;next.splice(end,0,next.splice(start,1)[0]);return next;
}
