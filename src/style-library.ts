import type {StylePromptPreset} from './types';
export const STYLE_SORTS=['default','custom','rating-desc','rating-asc','created-desc','created-asc','uses-desc','uses-asc','name'] as const;
export type StyleSort=typeof STYLE_SORTS[number];
export function styleMetadata(p:Partial<StylePromptPreset>) {
 const number=(v:unknown,fallback=0)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
 return {rating:Math.max(0,Math.min(5,number(p.rating))),usageCount:Math.max(0,Math.floor(number(p.usageCount))),sortOrder:Math.max(0,number(p.sortOrder,Number.MAX_SAFE_INTEGER))};
}
/** Keep the stored image order; legacy or removed covers fall back to the first image. */
export function styleCoverIndex(p: Pick<StylePromptPreset,'previewImages'|'coverImageId'>) {
 const images=p.previewImages??[];
 if(!images.length)return -1;
 const index=images.findIndex(im=>im.id===p.coverImageId);
 return index<0?0:index;
}
export function sortStyles(items:StylePromptPreset[],mode:string='default') {
 const time=(p:StylePromptPreset)=>Date.parse(p.createdAt)||0;
 return items.map((p,index)=>({p,index})).sort((a,b)=>{
  const x=styleMetadata(a.p),y=styleMetadata(b.p);
  const delta=mode==='custom'?x.sortOrder-y.sortOrder:mode==='name'?a.p.name.localeCompare(b.p.name):mode.startsWith('rating')?x.rating-y.rating:mode.startsWith('uses')?x.usageCount-y.usageCount:mode.startsWith('created')?time(a.p)-time(b.p):0;
  return (mode.endsWith('-desc')?-delta:delta)||a.index-b.index;
 }).map(x=>x.p);
}
export function moveStyle(items:StylePromptPreset[],id:string,before:string,visibleIds?:string[]) {
 const ordered=sortStyles(items,'custom');if(visibleIds){const ids=new Set(visibleIds),byId=new Map(items.map(p=>[p.id,p]));const visible=visibleIds.map(id=>byId.get(id)).filter((p):p is StylePromptPreset=>!!p);let i=0;for(let j=0;j<ordered.length;j++)if(ids.has(ordered[j].id))ordered[j]=visible[i++];}
 const from=ordered.findIndex(p=>p.id===id),to=ordered.findIndex(p=>p.id===before);
 if(from<0||to<0||from===to)return items;
 const [item]=ordered.splice(from,1);ordered.splice(to,0,item);
 const ranks=new Map(ordered.map((p,i)=>[p.id,i]));return items.map(p=>({...p,sortOrder:ranks.get(p.id)!}));
}
export function parseStyleLines(text:string) {
 return text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
  const i=line.indexOf('\t');const prompt=(i<0?line:line.slice(i+1)).trim();
  return {name:(i<0?prompt.slice(0,40):line.slice(0,i).trim())||prompt.slice(0,40),prompt};
 }).filter(x=>x.prompt);
}
export function matchStyleImages(names:string[],rows:{name:string}[],mode:string) {
 if(mode!=='none'&&new Set(names).size!==names.length)throw Error('Duplicate image filenames');
 const sorted=[...names].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 return rows.map((row,index)=>mode==='order'?sorted.slice(index,index+1):mode==='name'?sorted.filter(n=>n.replace(/\.[^.]+$/,'').toLocaleLowerCase()===row.name.toLocaleLowerCase()).slice(0,9):[]);
}
